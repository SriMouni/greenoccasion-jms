import os
import subprocess
import sys


def main():
    if len(sys.argv) < 3:
        print("Usage: python extract_single_abstract.py <paper_id> <pdf_filename>")
        sys.exit(1)

    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    script_path = os.path.join(base_dir, "scripts", "extract_abstracts.mjs")
    result = subprocess.run(
        [
            "node",
            script_path,
            "--paper-id",
            sys.argv[1],
            "--file-name",
            sys.argv[2],
        ],
        cwd=base_dir,
    )
    sys.exit(result.returncode)


if __name__ == "__main__":
    main()
