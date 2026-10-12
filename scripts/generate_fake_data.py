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

COLUMNS = [
    "aims_id", "full_name", "father_or_husband_name", "gender", "date_of_birth",
    "marital_status", "auxiliary", "majlis", "region", "address", "postcode",
    "phone", "email", "family_id", "head_of_household", "relationship_to_head",
    "last_verified_date", "verified_by", "notes",
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

# (region, [majlis...], postcode prefixes, towns)
AREAS = [
    ("London South", ["Baitul Futuh", "Morden", "Mitcham", "Tooting"], ["SM4", "CR4", "SW17"], "London"),
    ("London West", ["Hounslow North", "Southall", "Hayes", "Feltham"], ["TW3", "UB1", "UB3"], "London"),
    ("Islamabad", ["Tilford", "Farnham", "Guildford"], ["GU10", "GU9", "GU1"], "Surrey"),
    ("Midlands", ["Birmingham West", "Wolverhampton", "Coventry"], ["B16", "WV1", "CV1"], "West Midlands"),
    ("North East", ["Leeds", "Bradford", "Huddersfield"], ["LS8", "BD3", "HD1"], "West Yorkshire"),
    ("Scotland", ["Glasgow", "Edinburgh"], ["G41", "EH7"], "Scotland"),
]

STREETS = [
    "Mosque Lane", "Gressenhall Road", "London Road", "Church Street", "Victoria Road",
    "Station Road", "Park Avenue", "Queens Road", "High Street", "Mill Lane",
    "Elm Grove", "Oak Close", "Kings Avenue", "Grange Road", "Cedar Drive",
]


def rand_date(min_age, max_age):
    start = TODAY - timedelta(days=int(max_age * 365.25))
    end = TODAY - timedelta(days=int(min_age * 365.25))
    return start + timedelta(days=random.randint(0, (end - start).days))


def age_on(dob):
    return TODAY.year - dob.year - ((TODAY.month, TODAY.day) < (dob.month, dob.day))


def auxiliary_for(gender, dob):
    age = age_on(dob)
    if gender == "Male":
        if age < 15:
            return "Atfal"
        return "Khuddam" if age < 40 else "Ansar"
    return "Nasirat" if age < 15 else "Lajna"


def phone():
    return "07" + "".join(str(random.randint(0, 9)) for _ in range(9))


def email(first, last):
    domain = random.choice(["gmail.com", "hotmail.co.uk", "yahoo.co.uk", "outlook.com"])
    return f"{first}.{last}{random.randint(1, 99)}@{domain}".lower()


def postcode(prefix):
    return f"{prefix} {random.randint(1, 9)}{random.choice('ABDEFGHJLNPQRSTUWXYZ')}{random.choice('ABDEFGHJLNPQRSTUWXYZ')}"


def verification():
    if random.random() < 0.35:
        return "", ""
    d = TODAY - timedelta(days=random.randint(30, 900))
    return d.isoformat(), random.choice(["Tajneed Secretary", "Qaid Majlis", "Sadr Majlis", "Zaeem"])


def make_family(family_no, next_id):
    region, majlis_list, prefixes, town = random.choice(AREAS)
    majlis = random.choice(majlis_list)
    surname = random.choice(SURNAMES)
    address = f"{random.randint(1, 220)} {random.choice(STREETS)}, {majlis}, {town}"
    pc = postcode(random.choice(prefixes))
    family_id = f"F{family_no:04d}"
    people = []

    def add(first, gender, dob, father_or_husband, marital, head, relation, own_contact=True):
        nonlocal next_id
        verified_on, verified_by = verification()
        notes = random.choice(["", "", "", "", "Moved recently - confirm address", "Phone number may be old"])
        people.append({
            "aims_id": str(next_id),
            "full_name": f"{first} {surname}",
            "father_or_husband_name": father_or_husband,
            "gender": gender,
            "date_of_birth": dob.isoformat(),
            "marital_status": marital,
            "auxiliary": auxiliary_for(gender, dob),
            "majlis": majlis,
            "region": region,
            "address": address,
            "postcode": pc,
            "phone": phone() if own_contact else "",
            "email": email(first, surname) if own_contact else "",
            "family_id": family_id,
            "head_of_household": "Yes" if head else "No",
            "relationship_to_head": relation,
            "last_verified_date": verified_on,
            "verified_by": verified_by,
            "notes": notes,
        })
        next_id += random.randint(1, 37)

    father_first = random.choice(MALE_FIRST)
    father_dob = rand_date(30, 75)
    grandfather = f"{random.choice(MALE_FIRST)} {surname}"
    single = random.random() < 0.15

    add(father_first, "Male", father_dob, grandfather, "Single" if single else "Married", True, "Self")
    if single:
        return people, next_id

    father_name = f"{father_first} {surname}"
    mother_dob = father_dob + timedelta(days=random.randint(365, 365 * 6))
    if age_on(mother_dob) < 25:
        mother_dob = rand_date(25, 30)
    add(random.choice(FEMALE_FIRST), "Female", mother_dob, father_name, "Married", False, "Wife")

    max_child_age = max(7, min(age_on(mother_dob) - 20, 35))
    for _ in range(random.randint(0, 4)):
        gender = random.choice(["Male", "Female"])
        first = random.choice(MALE_FIRST if gender == "Male" else FEMALE_FIRST)
        dob = rand_date(7, max_child_age)
        relation = "Son" if gender == "Male" else "Daughter"
        add(first, gender, dob, father_name, "Single", False, relation, own_contact=age_on(dob) >= 15)
    return people, next_id


def main():
    members = []
    family_no = 1
    next_id = 10231
    while len(members) < TARGET_MEMBERS:
        people, next_id = make_family(family_no, next_id)
        members.extend(people)
        family_no += 1

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
