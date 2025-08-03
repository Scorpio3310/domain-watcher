import { z } from "zod/v4";

export const domainIdSchema = z.object({
    domainId: z
        .number()
        .int("ID must be an integer")
        .positive("ID must be positive")
        .max(9999999, "ID too large"),
});

export const addDomainSchema = z.object({
    domainName: z
        .string()
        .min(1, "Domain name is required")
        .max(253, "Domain name too long")
        .toLowerCase()
        .trim()
        .refine(
            (value) => {
                return (
                    !value.includes("http://") && !value.includes("https://")
                );
            },
            {
                message: "Do not include http:// or https:// in domain name",
            }
        )
        .refine(
            (value) => {
                return !value.includes("/");
            },
            {
                message: "Do not include paths (/) in domain name",
            }
        )
        .refine(
            (value) => {
                return !value.includes(":");
            },
            {
                message: "Do not include port (:) in domain name",
            }
        )
        .refine(
            (value) => {
                const domainRegex =
                    /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
                return domainRegex.test(value);
            },
            {
                message: "Invalid domain format",
            }
        )
        .refine(
            (value) => {
                return value.includes(".");
            },
            {
                message:
                    "Domain must have at least one dot (e.g., example.com)",
            }
        )
        .refine(
            (value) => {
                const parts = value.split(".");
                const tld = parts[parts.length - 1];
                return tld && tld.length >= 2;
            },
            {
                message: "Top-level domain must be at least 2 characters",
            }
        ),
});
