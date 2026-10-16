"""Generate fake tajneed data for testing.

Writes data/tajneed.csv, and data/tajneed.xlsx if openpyxl is installed.
All names, addresses, phone numbers and emails are made up.

    python3 scripts/generate_fake_data.py
"""

import csv
import random
from datetime import date, timedelta
from pathlib import Path

random.seed(42)

OUT_DIR = Path(__file__).resolve().parent.parent / "data"
TODAY = date(2026, 10, 1)
TARGET_MEMBERS = 200

# Same columns, same order, as the real tajneed sheet
COLUMNS = [
    "AMJS ID", "Family Code", "Relationship to HOF", "Record Status", "Name",
    "Marital Status", "Address 1", "Address 2", "Address 3", "Address 4", "City",
    "Post Code", "Country", "Telephone RES", "Telephone Work", "Mobile",
    "Telephone Other", "Email", "Branch", "Age", "Tanzeem", "Date of Birth",
    "Wasiyyat Number", "Wasiyyat Status", "Waqf-e-Nau Number",
]

MALE_FIRST = [
    "Ahmad", "Muhammad", "Mahmood", "Nasir", "Tahir", "Masroor", "Bashir", "Rafiq",
    "Hamid", "Khalid", "Tariq", "Imran", "Faisal", "Usman", "Bilal", "Zafar",
    "Naeem", "Waseem", "Saleem", "Mubarak", "Ataul", "Rashid", "Shahid", "Sajid",
    "Haris", "Danyal", "Zain", "Ayaan", "Hamza", "Yusuf", "Ibrahim", "Ismail",
]
FEMALE_FIRST = [
    "Amatul", "Sadia", "Ayesha", "Fatima", "Maryam", "Zainab", "Nusrat", "Rehana",
    "Shazia", "Farah", "Hina", "Sana", "Amina", "Khadija", "Sumaira", "Rabia",
    "Mahira", "Iqra", "Aleena", "Hafsa", "Noor", "Samina", "Tahira", "Bushra",
]
SURNAMES = [
    "Khan", "Ahmad", "Butt", "Chaudhry", "Malik", "Sheikh", "Qureshi", "Bajwa",
    "Cheema", "Warraich", "Shah", "Mirza", "Rana", "Javed", "Iqbal", "Hussain",
    "Rehman", "Latif", "Siddiqui", "Bhatti", "Ghuman", "Dogar", "Tahir", "Nasir",
]

# (branch, city, postcode prefix, landline area code)
BRANCHES = [
    ("Baitul Futuh", "Morden", "SM4", "020"),
    ("Mitcham", "Mitcham", "CR4", "020"),
    ("Tooting", "London", "SW17", "020"),
    ("Hounslow North", "Hounslow", "TW3", "020"),
    ("Southall", "Southall", "UB1", "020"),
    ("Islamabad", "Tilford", "GU10", "01252"),
    ("Birmingham West", "Birmingham", "B16", "0121"),
    ("Coventry", "Coventry", "CV1", "024"),
    ("Leeds", "Leeds", "LS8", "0113"),
    ("Bradford", "Bradford", "BD3", "01274"),
    ("Glasgow", "Glasgow", "G41", "0141"),
]

STREETS = [
    "Gressenhall Road", "London Road", "Church Street", "Victoria Road", "Station Road",
    "Park Avenue", "Queens Road", "High Street", "Mill Lane", "Elm Grove", "Oak Close",
    "Kings Avenue", "Grange Road", "Cedar Drive", "Mosque Lane",
]
LOCALITIES = ["", "", "", "Northfield", "Westbury", "St Johns", "Hillside"]


def rand_date(min_age, max_age):
    start = TODAY - timedelta(days=int(max_age * 365.25))
    end = TODAY - timedelta(days=int(min_age * 365.25))
    return start + timedelta(days=random.randint(0, (end - start).days))


def age_on(dob):
    return TODAY.year - dob.year - ((TODAY.month, TODAY.day) < (dob.month, dob.day))


def tanzeem_for(gender, age):
    if gender == "Male":
        if age < 15:
            return "Atfal"
        return "Khuddam" if age < 40 else "Ansar"
    return "Nasirat" if age < 15 else "Lajna"


def mobile():
    return "07" + "".join(str(random.randint(0, 9)) for _ in range(9))


def landline(area):
    return area + "".join(str(random.randint(0, 9)) for _ in range(11 - len(area)))


def email(first, last):
    domain = random.choice(["gmail.com", "hotmail.co.uk", "yahoo.co.uk", "outlook.com"])
    return f"{first}.{last}{random.randint(1, 99)}@{domain}".lower()


def postcode(prefix):
    letters = "ABDEFGHJLNPQRSTUWXYZ"
    return f"{prefix} {random.randint(1, 9)}{random.choice(letters)}{random.choice(letters)}"


class Ids:
    member = 10231
    wasiyyat = 31540
    waqf_nau = 52110


def make_family(family_code):
    branch, city, prefix, area = random.choice(BRANCHES)
    surname = random.choice(SURNAMES)
    house = random.choice([str(random.randint(1, 220)), f"Flat {random.randint(1, 30)}"])
    if house.startswith("Flat"):
        addr1, addr2 = house, f"{random.choice(['Oak', 'Elm', 'Rose', 'Park'])} House, {random.randint(1, 90)} {random.choice(STREETS)}"
    else:
        addr1, addr2 = f"{house} {random.choice(STREETS)}", ""
    addr3 = random.choice(LOCALITIES)
    pc = postcode(prefix)
    home_phone = landline(area) if random.random() < 0.6 else ""
    people = []

    def add(first, gender, dob, marital, relation, own_contact=True):
        age = age_on(dob)
        wasiyyat_no, wasiyyat_status = "", ""
        if age >= 15 and random.random() < 0.3:
            Ids.wasiyyat += random.randint(1, 60)
            wasiyyat_no, wasiyyat_status = str(Ids.wasiyyat), "M"
        waqf_nau = "0"
        if dob.year >= 1987 and random.random() < 0.25:
            Ids.waqf_nau += random.randint(1, 40)
            waqf_nau = str(Ids.waqf_nau)
        people.append({
            "AMJS ID": str(Ids.member),
            "Family Code": str(family_code),
            "Relationship to HOF": relation,
            "Record Status": "Active" if random.random() < 0.95 else "Inactive",
            "Name": f"{first} {surname}",
            "Marital Status": marital,
            "Address 1": addr1,
            "Address 2": addr2,
            "Address 3": addr3,
            "Address 4": "",
            "City": city,
            "Post Code": pc,
            "Country": "United Kingdom",
            "Telephone RES": home_phone,
            "Telephone Work": landline(area) if own_contact and age >= 22 and random.random() < 0.15 else "",
            "Mobile": mobile() if own_contact else "",
            "Telephone Other": mobile() if own_contact and random.random() < 0.05 else "",
            "Email": email(first, surname) if own_contact else "",
            "Branch": branch,
            "Age": str(age),
            "Tanzeem": tanzeem_for(gender, age),
            "Date of Birth": dob.strftime("%d/%m/%Y"),
            "Wasiyyat Number": wasiyyat_no,
            "Wasiyyat Status": wasiyyat_status,
            "Waqf-e-Nau Number": waqf_nau,
        })
        Ids.member += random.randint(1, 37)

    father_dob = rand_date(30, 75)
    single = random.random() < 0.15
    add(random.choice(MALE_FIRST), "Male", father_dob, "Single" if single else "Married", "Self")
    if single:
        return people

    mother_dob = father_dob + timedelta(days=random.randint(365, 365 * 6))
    if age_on(mother_dob) < 25:
        mother_dob = rand_date(25, 30)
    add(random.choice(FEMALE_FIRST), "Female", mother_dob, "Married", "Wife")

    max_child_age = max(7, min(age_on(mother_dob) - 20, 35))
    for _ in range(random.randint(0, 4)):
        gender = random.choice(["Male", "Female"])
        dob = rand_date(7, max_child_age)
        add(random.choice(MALE_FIRST if gender == "Male" else FEMALE_FIRST), gender, dob,
            "Single", "Son" if gender == "Male" else "Daughter", own_contact=age_on(dob) >= 15)
    return people


def main():
    members = []
    family_code = 4101
    while len(members) < TARGET_MEMBERS:
        members.extend(make_family(family_code))
        family_code += random.randint(1, 9)

    OUT_DIR.mkdir(exist_ok=True)
    csv_path = OUT_DIR / "tajneed.csv"
    with csv_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=COLUMNS)
        writer.writeheader()
        writer.writerows(members)
    print(f"Wrote {len(members)} members to {csv_path}")

    try:
        from openpyxl import Workbook
    except ImportError:
        print("openpyxl not installed - skipped tajneed.xlsx")
        return
    wb = Workbook()
    ws = wb.active
    ws.title = "Tajneed"
    ws.append(COLUMNS)
    for m in members:
        ws.append([m[c] for c in COLUMNS])
    # Keep everything as text so phone numbers keep their leading 0
    for row in ws.iter_rows(min_row=2):
        for cell in row:
            cell.number_format = "@"
    xlsx_path = OUT_DIR / "tajneed.xlsx"
    wb.save(xlsx_path)
    print(f"Wrote {len(members)} members to {xlsx_path}")


if __name__ == "__main__":
    main()
