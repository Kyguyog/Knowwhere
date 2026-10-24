Local utilities for maintaining KnowWhere:

- [Backup](Backup/README.md): the independent Firestore backup dashboard. Setup and Docker commands are in its README. From the repository root, enter it with `cd tools/Backup`.
- [Image Selector](<Image Selector/photo_picker.py>): the Flask screenshot picker. From the repository root, run `cd "tools/Image Selector"`, install `requirements.txt` in your Python environment, then run `python3 photo_picker.py`.

These tools run separately from the public website. Each tool keeps its own assets and dependencies alongside its code.
