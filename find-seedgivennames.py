"""
Script: getSeedNamesFromWikidata.py

Description:
    Loads a SPARQL query template from file, injects parameters,
    sends it to Wikidata's SPARQL endpoint, parses the response,
    and saves the result as a CSV file.

Author: ChatGPT (prompted by Wikidata User:OlafJanssen)
Date: 28 March 2025
"""

import pandas as pd
import requests
import time

# --- Configuration ---
query_template = "sparql/find-seedgivennames-template.rq"
output_file = "data/wikifaces-seedgivennames.csv"
SPARQL_ENDPOINT = "https://query.wikidata.org/sparql"

# Query parameters
sample_size = 750000
limit_results = 7500000
min_count = 10
language = "en"

def load_query(file_path: str, **kwargs) -> str:
    """
    Load and format a SPARQL query template with provided parameters.
    """
    with open(file_path, "r", encoding="utf-8") as f:
        query = f.read()
    return query.format(**kwargs)

def run_query(query: str, max_retries: int = 3, backoff: float = 2.0):
    """
    Execute a SPARQL query against Wikidata with retry logic.
    """
    headers = {"Accept": "application/sparql-results+json"}

    for attempt in range(1, max_retries + 1):
        try:
            response = requests.get(
                SPARQL_ENDPOINT,
                params={"query": query},
                headers=headers,
                timeout=60
            )
            if response.status_code == 200:
                return response.json()
            elif response.status_code == 429:
                raise Exception("Rate limit hit (HTTP 429). Try again later.")
            else:
                raise Exception(f"HTTP {response.status_code}:\n{response.text}")
        except requests.exceptions.Timeout:
            print(f"[⚠️] Timeout on attempt {attempt}. Retrying in {backoff} seconds...")
        except requests.exceptions.RequestException as e:
            print(f"[⚠️] Network error: {e}. Retrying in {backoff} seconds...")

        time.sleep(backoff)
        backoff *= 2

    raise Exception("SPARQL query failed after multiple retries.")

def parse_results(json_data):
    """
    Parse SPARQL JSON results into a pandas DataFrame.
    """
    results = json_data['results']['bindings']
    return pd.DataFrame([
        {
            "givennameLabel": item.get("givennameLabel", {}).get("value", ""),
            "qid": item.get("qid", {}).get("value", "")
        }
        for item in results
    ])

def main():
    try:
        print(f"[INFO] Loading SPARQL query from '{query_template}'...")
        query = load_query(
            query_template,
            sample_size=sample_size,
            limit_results=limit_results,
            min_count=min_count,
            language=language
        )

        print("[INFO] Sending query to Wikidata...")
        json_data = run_query(query)

        print("[INFO] Parsing results...")
        df = parse_results(json_data)

        print(f"[INFO] Writing {len(df)} rows to '{output_file}'...")
        df.to_csv(output_file, index=False, sep=";")

        print("[✅] Done.")

    except Exception as e:
        print(f"[❌ ERROR] {e}")

if __name__ == "__main__":
    main()
