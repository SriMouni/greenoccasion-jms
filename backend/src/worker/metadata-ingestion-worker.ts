import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { Job, Worker } from "bullmq";

type OpenAlexPdfDownloadJobData = {
  pdfUrl: string;
  submissionId?: string;
  fileName?: string;
};

type OpenAlexPdfDownloadJobResult = {
  pdfUrl: string;
  filePath: string;
  fileName: string;
  byteLength: number;
};

const queueName = process.env.OPENALEX_PDF_QUEUE ?? "openalex-pdf-download";

const connection = {
  host: process.env.REDIS_HOST ?? "127.0.0.1",
  port: Number(process.env.REDIS_PORT ?? 6379),
  password: process.env.REDIS_PASSWORD || undefined,
};

async function processOpenAlexPdfDownloadJob(
  job: Job<OpenAlexPdfDownloadJobData>,
): Promise<OpenAlexPdfDownloadJobResult> {
  const { pdfUrl, submissionId } = job.data;

  if (!pdfUrl) {
    throw new Error("Missing pdfUrl in OpenAlex PDF download job");
  }

  const response = await fetch(pdfUrl, {
    redirect: "follow",
    headers: {
      "User-Agent": "GreenOccasionJMS/1.0",
    },
  });

  if (!response.ok) {
    throw new Error(`PDF download failed: ${response.status} ${response.statusText}`);
  }

  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.toLowerCase().includes("pdf")) {
    throw new Error(`Expected PDF response, got content-type: ${contentType}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const fileName = buildPdfFileName(job);
  const filePath = await savePdfToLocalStorage(buffer, fileName);

  return {
    pdfUrl,
    filePath,
    fileName,
    byteLength: buffer.byteLength,
  };
}

function buildPdfFileName(job: Job<OpenAlexPdfDownloadJobData>): string {
  const rawName =
    job.data.fileName ??
    job.data.submissionId ??
    job.id ??
    `openalex-${Date.now()}`;

  const safeName = rawName
    .replace(/\.pdf$/i, "")
    .replace(/[^a-zA-Z0-9-_]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return `${safeName || `openalex-${Date.now()}`}.pdf`;
}

async function savePdfToLocalStorage(
  buffer: Buffer,
  fileName: string,
): Promise<string> {
  const storageDir =
    process.env.PDF_STORAGE_DIR ?? path.join(process.cwd(), "storage", "openalex-pdfs");

  await mkdir(storageDir, { recursive: true });

  const filePath = path.join(storageDir, fileName);

  await writeFile(filePath, buffer);

  return filePath;
}

export const openAlexPdfDownloadWorker =
  new Worker<OpenAlexPdfDownloadJobData>(
    queueName,
    processOpenAlexPdfDownloadJob,
    {
      connection,
      concurrency: Number(process.env.OPENALEX_PDF_CONCURRENCY ?? 2),
    },
  );

openAlexPdfDownloadWorker.on("completed", (job, result) => {
  console.log("OpenAlex PDF downloaded", {
    jobId: job.id,
    filePath: result.filePath,
    byteLength: result.byteLength,
  });
});

openAlexPdfDownloadWorker.on("failed", (job, error) => {
  console.error("OpenAlex PDF download failed", {
    jobId: job?.id,
    pdfUrl: job?.data?.pdfUrl,
    error: error.message,
  });
});

process.on("SIGTERM", async () => {
  await openAlexPdfDownloadWorker.close();
  process.exit(0);
});

process.on("SIGINT", async () => {
  await openAlexPdfDownloadWorker.close();
  process.exit(0);
});