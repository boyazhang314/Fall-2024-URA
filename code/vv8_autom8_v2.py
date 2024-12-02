## Automatically run vv8 crawler
## Calls static.py after all websites are finished

import subprocess
import time
from datetime import datetime, timedelta

failed_websites = []

time_limit = timedelta(minutes=25)

def run_command(command):
    try:
        process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        stdout, stderr = process.communicate()
        if process.returncode != 0:
            print(f"Error running command: {command}\n{stderr}")
        return stdout, stderr
    except Exception as e:
        print(f"Error: {e}")
        return None, None

def clean_up():
    print(f"Cleaning up...\n")
    command = ["python3", "./BehavioralBiometricSA/cleanup.py"]
    run_command(command)

def get_websites(path):
    try:
        with open(path, 'r') as file:
            websites = [line.strip() for line in file if line.strip()]
        return websites
    except FileNotFoundError:
        print(f"Error: File '{path}' not found")
        return []

def extract_log_time(log_line):
    timestamp_str = None
    try:
        start_index = log_line.find('[')
        end_index = log_line.find(': ')
        
        if start_index != -1 and end_index != -1:
            timestamp_str = log_line[start_index+1:end_index]
        return timestamp_str

    except Exception:
        return None

def monitor_logs(website):
    try:
        start_time = datetime.now()
        time_after = False

        with subprocess.Popen(
            ["python3", "./visiblev8-crawler/scripts/vv8-cli.py", "docker", "-f"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
        ) as process:
            for line in process.stdout:
                current_time = datetime.now()
                if current_time - start_time > time_limit:
                    print("Time limit exceeded. Exiting...")
                    return
                
                if time_after:
                    print(line.strip())
                    if f"Finished crawling, {website}" in line:
                        print("Process finished")
                        return
                    elif "Crawler failed" in line:
                        failed_websites.append(website)
                        print("Crawler failed")
                        return
                else:
                    timestamp_str = extract_log_time(line)
                    if timestamp_str:
                        try:
                            log_time = datetime.strptime(timestamp_str, "%Y-%m-%d %H:%M:%S,%f")
                            if not time_after and log_time >= start_time.replace(microsecond=0):
                                time_after = True
                        except ValueError:
                            continue
    except KeyboardInterrupt:
        print("Monitoring interrupted by user")

def run_static(website):
    try:
        print(f"Running static.py for {website}")
        command = ["python3", "./BehavioralBiometricSA/static.py", "--export", website]
        run_command(command)
    except Exception as e:
        print(f"Error running static.py: {e}")

def main():
    websites = get_websites("websites.txt")
    if not websites:
        return

    for website in websites:
        print(f"Processing website: {website}")

        crawl_command = ["python3", "./visiblev8-crawler/scripts/vv8-cli.py", "crawl", "-u", website, "-pp", "flow"]
        print("Running crawl command...")
        _, _ = run_command(crawl_command)

        print("Monitoring logs for 'finished' message...")
        monitor_logs(website)

        print(f"Finished processing {website}")
        time.sleep(10)

        # Run all websites and call static.py at the end

    run_static("all websites")

    print(f"Websites where crawler failed - {failed_websites}")

if __name__ == "__main__":
    main()
