# Put your books here

Drop plain-text books (`.txt`, UTF-8) in this folder. Subfolders are fine.
Project Gutenberg "Plain Text UTF-8" files work as they are: the licence
header/footer is removed and the title and author are read from them.
Otherwise the file name is used as the title. One book per file works best.

Then, from the project folder, build the dataset the site reads:

    python3 tools/c4_dataset_build.py --books books --out c4-dataset
    node tools/dataset-validate.js c4-dataset

To include your own record files too (entity: / word: lines):

    python3 tools/c4_dataset_build.py c4-dataset.txt my-records/ --books books --out c4-dataset

Re-run the build whenever you add or remove books. The site never reads this
folder directly; it reads c4-dataset/. Books here are ignored by git (only
this README is kept). See DATASET-SHARDING.md for details.
