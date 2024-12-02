## Truncates script_flow and multicore_static_info tables

import psycopg2
from psycopg2 import sql

# Database connection parameters
host = 'localhost'  # Since it's running on the same device
port = '5434'  # The port the database listens on
dbname = 'vv8_backend'  # Database name
user = 'vv8'  # Username
password = 'vv8'  # Password

conn = psycopg2.connect(
    dbname=dbname,
    user=user,
    password=password,
    host=host,
    port=port
)

truncate_query = "TRUNCATE TABLE script_flow;"
with conn.cursor() as cur:
    cur.execute(truncate_query)
    conn.commit()
print("Table `script_flow` has been truncated.")

truncate_query = "TRUNCATE TABLE multicore_static_info;"
with conn.cursor() as cur:
    cur.execute(truncate_query)
    conn.commit()
print("Table `multicore_static_info` has been truncated.")
    