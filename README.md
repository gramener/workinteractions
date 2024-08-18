# Work interactions

Shows Gramener interactions by department.

## Setup

```shell
git clone https://code.gramener.com/cto/workinteractions.git  # Git LFS required
npx http-server   # Or run any HTTP server and open index.html
```

## Data setup

On 31 May 2024, I saved <https://learn.gramener.com/people/keka_data> as `people.json` and copy-pasted the `const data = ...` from <view-source:https://learn.gramener.com/calendars/network> to `calendar.json`.

Then I ran this script to create <interactions.json>:

```python
import json
import pandas as pd

calendar = pd.read_json("calendar.json")
people = pd.read_json("people.json").set_index("email")
people = people[people["termination_id"] < 2 | people.index.isin(calendar["email"])]

# Replace calendar.email by lookup up people.id
calendar["source"] = calendar["email"].map(people["id"])
calendar["target"] = calendar["with"].map(people["id"])
del calendar["email"], calendar["with"]

interactions = {
  "nodes": people[["id", "location", "role", "job_title", "job_category", "subunit"]].fillna("NA").reset_index(drop=True).to_dict(orient="records"),
  "links": calendar.to_dict(orient="records")
}

with open("interactions.json", "w") as f:
  json.dump(interactions, f, separators=(',', ':'))
```
