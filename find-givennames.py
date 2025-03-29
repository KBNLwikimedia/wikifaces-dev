"""
Script: find-givennames.py

Description:
    This script reads a list of given names (with their Wikidata QIDs) from a CSV file.
    For each QID, it runs a SPARQL query against Wikidata to find humans:
        - With that given name (P735) and
        - With an image (P18) and
        - With an English Wikipedia article
    It collects at most SPARQL_RESULT_LIMIT results,
    where at least a minimum number of matches (MIN_RESULTS_THRESHOLD) exist,
    formats the image URLs, and saves the data to a new CSV file.

Configuration:
    - Global variables define max SPARQL results and min results threshold
    - SPARQL query is loaded from a template file with placeholders

Author: ChatGPT (prompted by Olaf Janssen)
Date: 2025-03-28
"""

import pandas as pd
import requests
import json
import time
import sys

# ------------------ Configuration ------------------
input_file = "data/wikifaces-seedgivennames.csv"
query_file = "sparql/find-givennames.rq"
output_file = "data/wikifaces-datacache.csv"
SPARQL_ENDPOINT = "https://query.wikidata.org/sparql"

SPARQL_RESULT_LIMIT = 6        # Max results per name, corresponding to LIMIT in sparql query
MIN_RESULTS_THRESHOLD = 2      # Minimum number of results to accept a name

# ------------------ Load query template ------------------
def load_query_template(path):
    """
    Load the SPARQL query template and return it as a string.
    """
    try:
        with open(path, "r", encoding="utf-8") as f:
            return f.read()
    except Exception as e:
        print(f"[❌ ERROR] Failed to load SPARQL query from '{path}': {e}")
        sys.exit(1)

# ------------------ Run SPARQL query ------------------
def run_query(qid, query_template, max_retries=3, backoff=2.0):
    """
    Sends a SPARQL query to Wikidata for a given QID.
    Retries the query on timeouts, network errors, and handles API issues.
    """
    query = query_template.format(qid=qid, limit=SPARQL_RESULT_LIMIT)
    headers = {"User-Agent": "WikidataQueryBot/1.0 (olaf.janssen@kb.nl)"}

    for attempt in range(1, max_retries + 1):
        try:
            response = requests.get(
                SPARQL_ENDPOINT,
                params={"query": query, "format": "json"},
                headers=headers,
                timeout=30
            )
            response.raise_for_status()
            return response.json()["results"]["bindings"]

        except requests.exceptions.Timeout:
            print(f"[⚠️] Timeout on attempt {attempt} for QID {qid}")
        except requests.exceptions.ConnectionError:
            print(f"[⚠️] Connection error on attempt {attempt} for QID {qid}")
        except requests.exceptions.HTTPError as e:
            print(f"[❌] HTTP error for QID {qid}: {e}")
            return []
        except requests.exceptions.RequestException as e:
            print(f"[⚠️] Request error for QID {qid}: {e}")
        except json.JSONDecodeError:
            print(f"[❌] JSON decode error for QID {qid}")
            return []
        except Exception as e:
            print(f"[❌] Unexpected error for QID {qid}: {e}")
            return []

        if attempt < max_retries:
            print(f"[ℹ️] Retrying in {backoff:.1f}s...")
            time.sleep(backoff)
            backoff *= 2
        else:
            print(f"[❌] Failed after {max_retries} attempts for QID {qid}")
            return []

    return []

# ------------------ Main logic ------------------
def main():
    """
    Main entry point of the script:
    - Loads the query
    - Reads the input CSV
    - Queries Wikidata for each given name QID
    - Filters results and writes to output CSV
    """
    try:
        print("[INFO] Loading SPARQL query template...")
        query_template = load_query_template(query_file)

        print("[INFO] Reading input CSV...")
        df = pd.read_csv(input_file, sep=";")
        results = []

        for index, row in df.iterrows():
            name_label = row["givennameLabel"]
            qid = row["qid"]
            print(f"[INFO] Querying for given name '{name_label}' ({qid})...")

            data = run_query(qid, query_template)
            print(data)
            if len(data) >= MIN_RESULTS_THRESHOLD:
                for item in data:
                    results.append({
                        "namekey": f"http://www.wikidata.org/entity/{qid}",
                        "imageurl": item.get("imageurl", {}).get("value", ""),
                        "person": item.get("person", {}).get("value", ""),
                        "personLabel": item.get("personLabel", {}).get("value", ""),
                        "personDescription": item.get("personDescription", {}).get("value", ""),
                        "wikipediaENurl": item.get("wikipediaENurl", {}).get("value", "")
                    })
                print(f"[✅] {len(data)} results added.")
            else:
                print(f"[⏩] Skipped (only {len(data)} results).")

            time.sleep(1)

        # Save to CSV
        if results:
            pd.DataFrame(results).to_csv(output_file, index=False, sep=";")
            print(f"[✅] Done! Saved {len(results)} rows to '{output_file}'")
        else:
            print("[⚠️] No results to save.")

    except KeyboardInterrupt:
        print("\n[⚠️] Interrupted by user. Exiting.")
    except Exception as e:
        print(f"[❌] Fatal error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
