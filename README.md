# Tajneed Renewal

A small offline app for checking and updating members' tajneed details. It needs no internet connection and no installation.

## How to run

1. Double-click `index.html` to open it in your browser. Chrome or Edge works best.
2. Click **Edit mode**.
3. Click **Choose CSV or Excel file** and pick your tajneed file. To try the app out, use the example file `data/tajneed.csv`.
   Your file needs the same column headers as the tajneed sheet (`AMJS ID`, `Name`, `Address 1`, ...).
4. Click **Open view tab**. Drag that tab onto the screen the member will look at.

You only need to pick the file once. The browser remembers the data after that.

## Using it

- Search by name or AMJS ID. Spelling mistakes and names typed in the wrong order still work.
- Click a member. Their details appear on the view tab for the member to check. Everything fits on one screen.
- Correct anything that's wrong and click **Save**. The view tab updates straight away. Age is worked out from the Date of Birth (dd/mm/yyyy).
- Click **Close** to clear the view tab before the next person.

## Saving your changes to the file

- In **Chrome or Edge**, clicking Save also writes the change into the file you opened. The first time, the browser asks for permission.
- In **other browsers**, changes are only kept inside the browser. Use **Export CSV** or **Export Excel** to download the updated file, then replace your old file with it.

Export regularly. Clearing your browser data deletes any changes you haven't exported.

## Example data

`data/tajneed.csv` and `data/tajneed.xlsx` contain about 200 made-up members. To make a new set:

```
python3 scripts/generate_fake_data.py
```
