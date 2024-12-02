/*** Tealium UTag Scraper ***/

const fs = require("fs");

const axios = require("axios");
const puppeteer = require("puppeteer");
const path = require("path");

/**
 * Extracts the tag from the utag file URL
 * @param {string} url - The URL of the utag file
 * @returns {string} - Extracted tag (e.g., "111") or "utag" by default
 */
function getTag(url) {
    const match = url.match(/utag\.(\d+)/);
    return match ? match[1] : "utag";
}

/**
 * Extracts the value of a variable from the file content
 * @param {string} content - The content of the utag file
 * @param {string} name - The name of the variable to find (e.g., "utag_name")
 * @returns {string|null} - The value of the variable
 */
function getValue(content, varName) {
    const regex = new RegExp(
        `[\'"]?${varName}[\'"]?\\s*[=:]\\s*['"]([^'"]+)['"]`
    );
    const match = content.match(regex);
    return match ? match[1] : null;
}

/**
 * Retrieves the list of websites to scrape from a text file
 * @param {string} filePath - Path to the file containing websites
 * @returns {string[]} - Array of website URLs
 */
function getWebsites(filePath) {
    return fs.readFileSync(filePath, "utf-8").split("\n").filter(Boolean);
}

/**
 * Validates a URL
 * @param {string} url - The URL to validate
 * @returns {boolean} - Returns true if the URL is valid, false otherwise
 */
function isValidUrl(url) {
    const urlRegex = /^(https?:\/\/[^\s/$.?#].[^\s]*)$/i;
    return urlRegex.test(url);
}

/**
 * Scrapes websites for utag-related files
 * @param {puppeteer.Browser} browser - Puppeteer browser instance
 * @param {string} websites - List of website URLs to scrape
 * @returns {Promise<object>} - Results with the website and extracted URLs
 */
async function getUtagFiles(browser, websites) {
    const utagFiles = {};

    for (const website of websites) {
        const page = await browser.newPage();

        try {
            const files = [];

            page.on("request", (request) => {
                const url = request.url();
                if (url.includes("utag")) {
                    files.push(url);
                }
            });
            console.log(`Visiting ${website}`);
            await page.goto(website, { waitUntil: "networkidle2" });

            utagFiles[website] = [...new Set(files)];
        } catch (err) {
            console.error(`Error processing ${website}:`, err);
        } finally {
            await page.close();
        }
    }

    return utagFiles;
}

/**
 * Fetches and processes the contents of utag files to extract script URLs
 * @param {puppeteer.Browser} browser - Puppeteer browser instance
 * @param {object} utagFiles - Object containing websites and their utag file URLs
 * @returns {Promise<object>} - Object with website, utag, and extracted script URLs
 */
async function getScriptURLs(browser, utagFiles) {
    const scriptURLs = {};

    for (const [website, files] of Object.entries(utagFiles)) {
        console.log(`Extracting script URLs for ${website}`);
        const page = await browser.newPage();

        scriptURLs[website] = {};
        for (const file of files) {
            const tag = getTag(file);
            scriptURLs[website][tag] = [];

            try {
                const response = await page.goto(file);
                const content = await response.text();

                const urlRegex =
                    /['"]?(base[_-]?url|src)['"]?\s*[:=]\s*['"]([^'"\s]+)['"]/g;
                let urls = [...content.matchAll(urlRegex)].map(
                    (match) => match[2]
                );

                urls = urls
                    .map((url) => {
                        if (url.startsWith("//")) {
                            url = "https:" + url;
                        }
                        return isValidUrl(url) ? url : null;
                    })
                    .filter(Boolean);

                urls = urls.map((url) => {
                    const varRegex = /##(utag_?[a-zA-Z0-9_]+)##/g;
                    let match;

                    while ((match = varRegex.exec(url)) !== null) {
                        const value = getValue(
                            content,
                            match[1].replace(/^utag_/, "")
                        );
                        if (value) {
                            url = url.replace(match[0], value);
                        }
                    }
                    return url;
                });

                scriptURLs[website][tag] = urls;
            } catch (err) {
                console.error(`Failed to fetch or parse ${file}:`, err);
            }
        }

        await page.close();
    }

    return scriptURLs;
}

/**
 * Function to download all scripts for a given website
 * @param {string} website - Website URL
 * @param {Array} urls - Array of script URLs to download
 */
async function downloadScripts(website, urls) {
    for (const url of urls) {
        try {
            const filename = url.split("/").pop().split("?")[0];
            const savePath = path.join(
                __dirname,
                "scripts",
                website.replace(/^https:\/\//, ""),
                filename
            );

            const dir = path.dirname(savePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            const response = await axios({
                method: "get",
                url: url,
                responseType: "stream",
            });

            const fileStream = fs.createWriteStream(savePath);
            response.data.pipe(fileStream);
            await new Promise((resolve, reject) => {
                fileStream.on("finish", resolve);
                fileStream.on("error", (err) => {
                    console.error(`File stream error for ${url}:`, err.message);
                    reject(err);
                });
            });
        } catch (err) {
            console.error(`Failed to download ${url}`);
        }
    }
}

/**
 * Main function
 * utagFiles.json  - JSON of websites and their utag files
 * scriptURLs.json - JSON of websites and their loaded scripts
 * /scripts        - Folder of downloaded scripts
 */
(async function main() {
    const websitesFile = path.join(
        __dirname,
        process.argv[2] || "websites.txt"
    );

    const websites = getWebsites(websitesFile);
    const browser = await puppeteer.launch();

    try {
        const utagFiles = await getUtagFiles(browser, websites);
        fs.writeFileSync("utagFiles.json", JSON.stringify(utagFiles, null, 2));

        const scriptURLs = await getScriptURLs(browser, utagFiles);
        fs.writeFileSync(
            "scriptURLs.json",
            JSON.stringify(scriptURLs, null, 2)
        );

        for (const [website, urls] of Object.entries(scriptURLs)) {
            await downloadScripts(website, [].concat(...Object.values(urls)));
        }
    } catch (err) {
        console.error("An error occurred:", err);
    } finally {
        await browser.close();
    }
})();
