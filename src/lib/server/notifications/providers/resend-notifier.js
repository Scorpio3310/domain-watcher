import { Resend } from "resend";

/**
 * Resend Email notification service for formatting and sending messages
 */
export const resendNotifier = {
    /**
     * Send domain monitoring report via Resend Email
     * @param {Object} settings - Resend settings object
     * @param {string} settings.api_key - Resend API key
     * @param {string} settings.from_email - Sender email address
     * @param {string} settings.to_email - Recipient email address
     * @param {Object} domainUpdates - Domain update data
     * @returns {Promise<Object>} Send result
     */
    async sendDomainReport(settings, domainUpdates, origin = "") {
        try {
            if (!settings?.api_key || !settings?.to_email) {
                return {
                    success: false,
                    message: "Resend API key or recipient email not configured",
                };
            }

            // Initialize Resend client
            const resend = new Resend(settings.api_key);

            const emailContent = this.formatEmailContent(domainUpdates, origin);

            const emailData = {
                from: settings.from_email || null,
                to: [settings.to_email],
                subject:
                    domainUpdates.totalCount === 0
                        ? "🌐 Domain Watcher: All quiet on the digital front! 🤠"
                        : `🌐 Domain Watcher Report - ${domainUpdates.totalCount} updates need your attention!`,
                html: emailContent.html,
                text: emailContent.text,
            };

            // Send email using Resend SDK
            const { data, error } = await resend.emails.send(emailData);

            if (error) {
                console.error("❌ Resend email failed:", error);

                // Handle specific Resend API errors
                let errorMessage = error.message || "Unknown error occurred";

                if (error.message?.includes("API key")) {
                    errorMessage = "Invalid API key";
                } else if (error.message?.includes("rate limit")) {
                    errorMessage = "Rate limit exceeded";
                } else if (error.message?.includes("from")) {
                    errorMessage = "Invalid 'from' email address";
                } else if (error.message?.includes("to")) {
                    errorMessage = "Invalid 'to' email address";
                }

                return {
                    success: false,
                    message: `Resend API error: ${errorMessage}`,
                };
            }

            if (data && data.id) {
                console.log(
                    "✅ Resend domain report sent successfully, ID:",
                    data.id
                );
                return {
                    success: true,
                    message: "Domain report sent via Resend successfully",
                    data: {
                        emailId: data.id,
                        from: settings.from_email,
                        to: settings.to_email,
                        sentAt: new Date().toISOString(),
                    },
                };
            }

            console.warn("⚠️ Resend email sent but no data returned");
            return {
                success: false,
                message: "Email sent but response was unexpected",
            };
        } catch (error) {
            console.error("❌ Failed to send Resend notification:", error);

            // Handle network/connection errors
            if (error.code === "ENOTFOUND" || error.code === "ECONNREFUSED") {
                return {
                    success: false,
                    message:
                        "Failed to connect to Resend API - check your internet connection",
                };
            }

            return {
                success: false,
                message: `Failed to send email: ${error.message}`,
            };
        }
    },

    /**
     * Format domain updates into email content (HTML + Text)
     */
    formatEmailContent(domainUpdates, origin = "") {
        const {
            available = [],
            expiring = [],
            expired = [],
            totalCount,
        } = domainUpdates;
        const timestamp = new Date().toLocaleString();

        // Generate HTML version
        const html = this.generateHtmlContent(
            timestamp,
            totalCount,
            {
                available,
                expiring,
                expired,
            },
            origin
        );

        // Generate text version
        const text = this.generateTextContent(timestamp, totalCount, {
            available,
            expiring,
            expired,
        });

        return { html, text };
    },

    /**
     * Generate modern HTML email content with new template
     */
    generateHtmlContent(
        timestamp,
        totalCount,
        { available, expiring, expired },
        origin = ""
    ) {
        const sections = [
            {
                domains: expired,
                title: "🚨 Expired but Still Registered",
                color: "#ED0000",
                bgColor: "#F9E1E1",
            },
            {
                domains: available,
                title: "🟢 Available Domains",
                color: "#2BA805",
                bgColor: "#E6F4E2",
            },
            {
                domains: expiring,
                title: "⚠️ Expiring Soon",
                color: "#EB700A",
                bgColor: "#F9EDE2",
            },
        ];

        const sectionsHtml = sections
            .filter(({ domains }) => domains.length > 0)
            .map(({ domains, title, color, bgColor }) => {
                const domainList = domains
                    .slice(0, 20)
                    .map((domain) => {
                        const isUrgent = title.includes("Expired");

                        if (isUrgent && domain.expires) {
                            const daysExpired = Math.abs(
                                this.getDaysUntilExpiry(domain.expires)
                            );
                            return `<li><strong>${
                                domain.domain_name
                            }</strong> - expired ${this.formatDate(
                                domain.expires
                            )} (${daysExpired} days ago)</li>`;
                        }

                        if (domain.expires) {
                            const daysUntilExpiry = this.getDaysUntilExpiry(
                                domain.expires
                            );
                            return `<li><strong>${
                                domain.domain_name
                            }</strong> - expires ${this.formatDate(
                                domain.expires
                            )} (${daysUntilExpiry} days)</li>`;
                        }

                        return `<li><strong>${domain.domain_name}</strong></li>`;
                    })
                    .join("");

                const moreText =
                    domains.length > 20
                        ? `<p style="color: #1a1a1a; font-style: italic; margin: 0; font-size: 13px; opacity: 0.5;">... and ${
                              domains.length - 20
                          } more domains</p>`
                        : "";

                return `
                    <div style="font-size: 14px; background-color: ${bgColor}; padding: 16px; border-radius: 16px; margin-bottom: 12px;">
                        <p style="margin: 0; font-weight: 600; color: ${color};">
                            ${title} (${domains.length})
                        </p>
                        <ul style="margin: 0; padding-left: 20px; color: #1A1A1A;">
                            ${domainList}
                        </ul>
                        ${moreText}
                    </div>
                `;
            })
            .join("");

        const noUpdatesContent =
            totalCount === 0
                ? `
            <div style="text-align: center; padding: 40px 20px; color: #1A1A1A;">
                <p style="font-size: 18px; margin: 0 0 8px 0; font-weight: 600;">
                    ${this.getRandomQuietMessage()}
                </p>
                <p style="font-size: 14px; margin: 0; opacity: 0.7; line-height: 1.4;">
                    Your domain portfolio is having a peaceful day - no expired domains, no urgent renewals, just pure digital harmony. 
                </p>
            </div>
        `
                : "";

        return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
    <title>Domain Watcher - Daily Report</title>
</head>
<body style="background-color: #F0F0F0; margin: 0; font-family: Figtree, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
    <div style="padding: 32px 16px;">
         <div style="background-color: #1A1A1A; padding: 12px; border-radius: 100px; max-width: 218px; margin: 0 auto; margin-bottom: 24px;">
            <img src="${origin}/img_logo.png" 
                 alt="Domain Watcher Logo" 
                 style="width: 218px; "
                 width="218">
        </div>
        <div style="background-color: #FFFFFF; padding: 20px; border-radius: 32px; max-width: 768px; margin: 0 auto; width: 100%;">
            <h1 style="color: #1A1A1A; font-size: 24px; margin: 0; line-height: 1.3;">
                Domain Detective Report 🕵️
            </h1>
            <p style="color: #1A1A1A; font-size: 14px; margin-top: 12px; margin-bottom: 0px; opacity: 0.7; line-height: 1.4;">
                Date: ${timestamp} • ${totalCount} domain update${
            totalCount !== 1 ? "s" : ""
        }
            </p>
            <hr style="border: 1px dashed #1A1A1A; opacity: 0.10; margin: 16px 0px"/>
            
            ${totalCount > 0 ? sectionsHtml : noUpdatesContent}
            
            <hr style="border: 1px dashed #1A1A1A; opacity: 0.10; margin: 16px 0px"/>
            <p style="color: #1A1A1A; font-size: 14px; line-height: 1.5; margin: 0; opacity: 0.5;">
                This is an automated report from your Domain Watcher system
            </p>
        </div>
    </div>
</body>
</html>
        `.trim();
    },

    /**
     * Generate plain text email content
     */
    generateTextContent(
        timestamp,
        totalCount,
        { available, expiring, expired }
    ) {
        const sections = [
            { domains: expired, title: "🚨 EXPIRED BUT STILL REGISTERED" },
            { domains: available, title: "🟢 AVAILABLE DOMAINS" },
            { domains: expiring, title: "⚠️ EXPIRING SOON" },
        ];

        const sectionsText = sections
            .filter(({ domains }) => domains.length > 0)
            .map(({ domains, title }) => {
                const domainList = domains
                    .slice(0, 20)
                    .map((domain) => {
                        const isUrgent = title.includes("EXPIRED");

                        if (isUrgent && domain.expires) {
                            const daysExpired = Math.abs(
                                this.getDaysUntilExpiry(domain.expires)
                            );
                            return `• ${
                                domain.domain_name
                            } - expired ${this.formatDate(
                                domain.expires
                            )} (${daysExpired} days ago)`;
                        }

                        if (domain.expires) {
                            const daysUntilExpiry = this.getDaysUntilExpiry(
                                domain.expires
                            );
                            return `• ${
                                domain.domain_name
                            } - expires ${this.formatDate(
                                domain.expires
                            )} (${daysUntilExpiry} days)`;
                        }

                        return `• ${domain.domain_name}`;
                    })
                    .join("\n");

                const moreText =
                    domains.length > 20
                        ? `\n... and ${domains.length - 20} more domains`
                        : "";

                return `\n${title} (${domains.length}):\n${domainList}${moreText}\n`;
            })
            .join("\n" + "=".repeat(50) + "\n");

        return `
Domain Watcher - Daily Report
${timestamp} • ${totalCount} domain update${totalCount !== 1 ? "s" : ""}

${"=".repeat(50)}
${
    totalCount > 0
        ? sectionsText
        : `${this.getRandomQuietMessage()}

Your domain portfolio is having a peaceful day - no expired domains, no urgent renewals, just pure digital harmony.`
}

${"=".repeat(50)}

This is an automated report from your Domain Watcher system.
        `.trim();
    },

    /**
     * Format date for display
     */
    formatDate(dateString) {
        return new Date(dateString).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
        });
    },

    /**
     * Get days until domain expiry (negative if expired)
     */
    getDaysUntilExpiry(expiryDate) {
        const expiry = new Date(expiryDate);
        const diffTime = expiry - new Date();
        return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    },

    /**
     * Get a random fun message for quiet days
     */
    getRandomQuietMessage() {
        const messages = [
            "🧘‍♂️ Zen mode activated - All domains chilling like champions!",
            "🏖️ Beach vibes only - Your domains are soaking up the sun!",
            "😴 Sleepy Sunday energy - Even your domains took a nap today!",
            "🕶️ Cool as a cucumber - Your portfolio is smooth and unbothered!",
            "🎭 Plot twist: Sometimes no news IS the best news!",
            "🏆 Achievement unlocked: Zero drama domains! Time for coffee!",
            "🦄 Unicorn status - Your domains are basically mythical today!",
            "🎪 The show must NOT go on - Because there's literally nothing dramatic happening!",
        ];

        // Pick a random message based on the day to keep it fresh
        const messageIndex = new Date().getDay() % messages.length;
        return messages[messageIndex];
    },
};
