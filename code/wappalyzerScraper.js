const fs = require("fs");

const puppeteer = require("puppeteer");

(async () => {
    const browser = await puppeteer.launch({
        headless: true,
        timeout: 60000,
    });
    const page = await browser.newPage();

    await page.goto("https://www.wappalyzer.com/technologies/analytics/", {
        waitUntil: "domcontentloaded",
    });

    const buttonSelector =
        ".v-btn.v-btn--outlined.theme--dark.v-size--small.accent--text";
    await page.waitForSelector(buttonSelector, {
        visible: true,
        timeout: 60000,
    });
    await page.click(buttonSelector);

    const technologies = await page.evaluate(() => {
        const table = document.querySelector("table");
        if (!table) return [];

        const rows = Array.from(table.querySelectorAll("tr"));
        return rows
            .map((row) => {
                const cells = Array.from(row.querySelectorAll("td"));
                if (cells.length >= 2) {
                    const linkElement = cells[1].querySelector("a");
                    if (linkElement) {
                        return {
                            key: cells[1].innerText.trim(),
                            href: linkElement.href,
                        };
                    }
                }
                return null;
            })
            .filter(Boolean);
    });

    let limit = 228;
    const websites = {};
    for (const { key, href } of technologies) {
        if (limit == 0) {
            break;
        }
        console.log(`Retrieving websites for ${key}`);
        websites[key] = [];

        try {
            await page.goto(href, {
                waitUntil: "domcontentloaded",
                timeout: 60000,
            });
            await page.waitForSelector("table", {
                visible: true,
                timeout: 60000,
            });

            const values = await page.evaluate(() => {
                const table = document.querySelector("table");
                if (!table) return [];

                const rows = Array.from(table.querySelectorAll("tr"));
                return rows
                    .slice(0, 4)
                    .map((row) => {
                        const cells = Array.from(row.querySelectorAll("td"));
                        if (cells.length >= 2) {
                            return "https://" + cells[1].innerText.trim();
                        }
                        return null;
                    })
                    .filter(Boolean);
            });
            console.log(values);
            websites[key] = values;
        } catch (e) {
            console.error(`Error processing ${key} -`, e);
        }
        limit -= 1;
    }

    fs.writeFileSync("websites.json", JSON.stringify(websites, null, 2));

    const flatWebsites = [...new Set(Object.values(websites).flat())].join(
        "\n"
    );
    fs.writeFile("websites.txt", flatWebsites, () => {});

    await browser.close();
})();
