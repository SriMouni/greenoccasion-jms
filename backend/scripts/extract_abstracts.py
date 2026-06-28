import os
import subprocess
import sys


def main():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    script_path = os.path.join(base_dir, "scripts", "extract_abstracts.mjs")
    result = subprocess.run(["node", script_path], cwd=base_dir)
    sys.exit(result.returncode)


if __name__ == "__main__":
    main()
