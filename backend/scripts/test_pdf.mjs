import fs from 'fs';
import { PDFParse } from 'pdf-parse';

async function testPdf() {
    const file = 'uploads/seed-1772866073553-climatic-benefits-of-black-carbon-emission-reduction-when-india-adopts-the-us-on.pdf';
    console.log("Reading", file);
    let parser;

    try {
        const buffer = fs.readFileSync(file);
        parser = new PDFParse({ data: buffer });
        const data = await parser.getText();
        console.log("Parsed length", data.text.length);
        fs.writeFileSync('debug_abstract.txt', data.text);
        console.log("Wrote debug text");
    } catch (e) {
        fs.writeFileSync('debug_error.txt', e.toString() + "\n" + e.stack);
        console.log("Wrote debug error");
    } finally {
        if (parser) {
            await parser.destroy();
        }
    }
}
testPdf();
