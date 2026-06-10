<script>
    import Button from "$components/Button.svelte";
    import Input from "$components/Input.svelte";
    import { toast } from "$src/lib/stores/toast.svelte.js";
    import { slide } from "svelte/transition";
    import Icon from "@iconify/svelte";
    import { isDemo } from "$src/lib/utils/helpers.js";
    import {
        UI_DOMAIN_VIEW,
        WHOIS_JSON_API_STATUS,
        SLACK_CONNECTION_STATUS,
        RESEND_CONNECTION_STATUS,
    } from "$src/lib/constants/constants";
    import RadioButton from "$components/RadioButton.svelte";
    import ToggleSwitch from "$components/ToggleSwitch.svelte";
    import { page } from "$app/state";
    import { formatLastChecked } from "$src/lib/utils/helpers.js";
    import {
        saveApiKey,
        updateUiView,
        updateSlackEnabled,
        updateSlackWebhook,
        updateResendEnabled,
        updateResendConfig,
    } from "$src/lib/remote/settings.remote";
    import {
        whoIsApiKeySchema,
        slackWebhookSchema,
        resendSchema,
    } from "./validation";

    //// PROPS ////
    /** @type {import('./$types').PageProps} */
    let { data } = $props();

    //// REMOTE FORMS ////
    // Seed the radio selection (as("radio") has no initial-value argument)
    // svelte-ignore state_referenced_locally
    updateUiView.fields.viewMode.set(data?.viewMode ?? UI_DOMAIN_VIEW.COMPACT);

    // Section visibility follows the live toggle state, falling back to the loaded value
    const slackEnabled = $derived(
        updateSlackEnabled.fields.enabled.value() ?? data?.slackEnabled ?? false,
    );
    const resendEnabled = $derived(
        updateResendEnabled.fields.enabled.value() ??
            data?.resendEnabled ??
            false,
    );

    /**
     * Shared enhance handler: submit, then toast the result on success.
     * Validation issues render inline below the inputs.
     * @param {{ submit: () => Promise<boolean>, readonly result: {status: number, message: string} | undefined }} form
     */
    async function submitWithToast(form) {
        try {
            if (await form.submit()) {
                if (form.result) toast.show(form.result);
            }
            // invalid data -> issues render inline
        } catch {
            toast.show({ status: 500, message: "Something went wrong" });
        }
    }

    /**
     * Submit handler for forms without inline issue rendering (toggles, uiView
     * radios) — validation issues surface as a toast instead. The optional
     * `revert` callback runs on any failure (validation, non-2xx result,
     * exception) so the control can snap back to the last persisted state.
     * @param {{ submit: () => Promise<boolean>, readonly result: {status: number, message: string} | undefined, fields: { allIssues: () => Array<{message: string}> | undefined } }} form
     * @param {() => void} [revert] - Restores the field to its persisted value
     */
    async function submitWithIssueToast(form, revert = undefined) {
        try {
            if (await form.submit()) {
                if (form.result) toast.show(form.result);
                if (
                    form.result &&
                    (form.result.status < 200 || form.result.status >= 300)
                ) {
                    revert?.();
                }
            } else {
                const issues = form.fields.allIssues() ?? [];
                toast.show({
                    status: 400,
                    message: issues.map((i) => i.message).join(", "),
                });
                revert?.();
            }
        } catch {
            toast.show({ status: 500, message: "Something went wrong" });
            revert?.();
        }
    }
</script>

<svelte:head>
    <title>Settings // Domain Watcher</title>
    <meta
        name="description"
        content="Manage Domain Watcher notification settings, configure Slack and email alerts for domain monitoring and status updates."
    />
    <!-- Open Graph / Facebook -->
    <meta property="og:type" content="website" />
    <meta property="og:url" content={page?.url?.href} />
    <meta property="og:title" content="Settings // Domain Watcher" />
    <meta
        property="og:description"
        content="Manage Domain Watcher notification settings, configure Slack and email alerts for domain monitoring and status updates."
    />
    <meta property="og:image" content="{page?.url?.origin}/og_image.jpg" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:site_name" content="Domain Watcher" />

    <!-- Twitter -->
    <meta property="twitter:card" content="summary_large_image" />
    <meta property="twitter:url" content={page?.url?.href} />
    <meta property="twitter:title" content="Settings // Domain Watcher" />
    <meta
        property="twitter:description"
        content="Manage Domain Watcher notification settings, configure Slack and email alerts for domain monitoring and status updates."
    />
    <meta property="twitter:image" content="{page?.url?.origin}/og_image.jpg" />
</svelte:head>

<div class="hero-section mt-16">
    <div class="grid gap-4 text-center">
        <h1>Settings</h1>
    </div>
</div>

<div class="max-w-3xl mx-auto mt-16 grid gap-2">
    <section class="card">
        <form
            class="card--settings"
            {...saveApiKey.preflight(whoIsApiKeySchema).enhance(submitWithToast)}
            oninput={() => saveApiKey.validate({ preflightOnly: true })}
        >
            <h2>WhoIsJson.com</h2>
            <p>
                whoisjson.com is the service used to retrieve domain
                information, such as availability, registration details, and
                expiration dates. It fetches domain data via their API.<br />
                For registration and API key setup, visit:
                <a
                    href="https://whoisjson.com"
                    target="_blank"
                    title="whoisjson.com"
                    aria-label="whoisjson.com">whoisjson.com</a
                >.
            </p>
            <Input
                type="text"
                id="apiKey"
                placeholder="Enter WhoIsJson API Key...."
                label="API Key"
                tooltip="Your WhoisJson API key enables domain verification and monitoring. Get your free API key at whoisjson.com"
                disabled={isDemo() || !!saveApiKey.pending}
                variant={saveApiKey.fields.apiKey.issues()?.length
                    ? "error"
                    : "default"}
                helperText={saveApiKey.fields.apiKey.issues()?.[0]?.message ??
                    ""}
                {...saveApiKey.fields.apiKey.as(
                    "text",
                    data?.apiKeyConfig?.api_key ?? "",
                )}
            />
            <hr />
            <div class="grid gap-0.5">
                <h6>Want to make sure everything’s working?</h6>
                <p>
                    We’ll fetch the domain example.com as a test, so you can
                    confirm everything is working properly.
                </p>
                <div class="warning">
                    <Icon icon="iconoir:message-alert" class="icon" />
                    <div>
                        Testing will perform one request via the whoisjson.com
                        API
                    </div>
                </div>
            </div>
            <div class="save">
                <div class="space-y-0.5">
                    <div class="response">
                        <div class="text">API Status:</div>
                        {#if data?.apiKeyConfig?.connection_status === WHOIS_JSON_API_STATUS.VALID}
                            <div class="status status--valid">
                                <div class="icon"></div>
                                Connected and verified
                            </div>
                        {:else if data?.apiKeyConfig?.connection_status === WHOIS_JSON_API_STATUS.INVALID}
                            <div class="status status--invalid">
                                <div class="icon"></div>
                                Invalid API key
                            </div>
                        {:else if data?.apiKeyConfig?.connection_status === WHOIS_JSON_API_STATUS.NOT_CONFIGURED}
                            <div class="status status--unknown">
                                <div class="icon"></div>
                                Please configure your API key
                            </div>
                        {:else}
                            <div class="status status--unknown">
                                <div class="icon"></div>
                                Status unknown
                            </div>
                        {/if}
                    </div>
                    <div class="response">
                        <p class="text">
                            Last verified: <span class="italic">
                                {formatLastChecked(
                                    data?.apiKeyConfig
                                        ?.connection_verified_at ?? null,
                                ) || "Never"}</span
                            >
                        </p>
                    </div>
                </div>

                <Button
                    type="submit"
                    text="Test & Save API Key"
                    size="md"
                    color="white"
                    ariaLabel="Test & Save API Key"
                    icon={isDemo()
                        ? "iconoir:save-floppy-disk"
                        : saveApiKey.pending
                          ? "iconoir:refresh-double"
                          : "iconoir:save-floppy-disk"}
                    iconClass={saveApiKey.pending ? "animate-spin" : ""}
                    disabled={isDemo() || !!saveApiKey.pending}
                />
            </div>
        </form>
    </section>

    <section class="card card--settings">
        <h2>General</h2>

        <div class="black-bg-card space-y-3">
            <h3>Domain List View</h3>
            <p>
                Choose how domain information is displayed in your list. You can
                opt for a compact view or a detailed view with full domain data.
            </p>
            <form
                class="card--settings"
                {...updateUiView.enhance((form) =>
                    submitWithIssueToast(form, () =>
                        updateUiView.fields.viewMode.set(
                            data?.viewMode ?? UI_DOMAIN_VIEW.COMPACT,
                        ),
                    ),
                )}
            >
                <label for="compact-view" class="ui-view">
                    <RadioButton
                        id="compact-view"
                        {...updateUiView.fields.viewMode.as(
                            "radio",
                            UI_DOMAIN_VIEW.COMPACT,
                        )}
                        disabled={isDemo() || !!updateUiView.pending}
                        size="md"
                        variant="primary"
                        ariaLabel="Select compact view"
                    />

                    <div class="view-card">
                        <h4>Compact View</h4>
                        <p>
                            Only shows domain name and availability status -
                            ideal for a clean, minimal overview
                        </p>
                        <div class="domain-card">
                            <div class="row">
                                <div class="left">
                                    <div class="size-5"></div>
                                    <div class="h-3 w-14 sm:w-40 md:w-52"></div>
                                </div>
                                <div class="right">
                                    <div class="h-4 w-12"></div>
                                    <div class="size-4"></div>
                                </div>
                            </div>
                        </div>
                    </div>
                </label>
                <label for="detailed-view" class="ui-view">
                    <RadioButton
                        id="detailed-view"
                        {...updateUiView.fields.viewMode.as(
                            "radio",
                            UI_DOMAIN_VIEW.DETAILED,
                        )}
                        disabled={isDemo() || !!updateUiView.pending}
                        size="md"
                        variant="primary"
                        ariaLabel="Select detailed view"
                    />

                    <div class="view-card">
                        <h4>Detailed View</h4>
                        <p>
                            Displays full domain details, including registrar
                            and expiration date - perfect for deeper monitoring
                        </p>
                        <div class="domain-card">
                            <div class="row">
                                <div class="left">
                                    <div class="size-5"></div>
                                    <div class="h-3 w-14 sm:w-40 md:w-52"></div>
                                </div>
                                <div class="right">
                                    <div class="h-4 w-12"></div>
                                    <div class="size-4"></div>
                                </div>
                            </div>
                            {#each Array(4) as _, i (i)}
                                <hr />
                                <div class="row">
                                    <div class="left">
                                        <div class="h-3 w-36"></div>
                                    </div>
                                </div>
                            {/each}
                        </div>
                    </div>
                </label>
                <hr />
                <div class="buttons">
                    <Button
                        type="button"
                        text="Reset to Default"
                        size="md"
                        color="black-outline"
                        ariaLabel="Reset to Default"
                        class="hidden! md:flex!"
                        disabled={isDemo() || !!updateUiView.pending}
                        onclick={() => {
                            updateUiView.fields.viewMode.set(
                                UI_DOMAIN_VIEW.COMPACT,
                            );
                        }}
                    />
                    <Button
                        type="submit"
                        text="Save Changes"
                        size="md"
                        color="white"
                        ariaLabel="Save Changes"
                        icon={isDemo()
                            ? "iconoir:save-floppy-disk"
                            : updateUiView.pending
                              ? "iconoir:refresh-double"
                              : "iconoir:save-floppy-disk"}
                        iconClass={updateUiView.pending ? "animate-spin" : ""}
                        disabled={isDemo() || !!updateUiView.pending}
                    />
                </div>
            </form>
        </div>
    </section>

    <section class="card card--settings">
        <h2>Notifications</h2>
        <p>
            Stay informed about your domain status with automated notifications.
            Choose from multiple notification channels and receive daily updates
            about domain availability and expiration alerts.
        </p>

        <div class="black-bg-card">
            <form {...updateSlackEnabled}>
                <label for="slack" class="space-y-1">
                    <div class="flex justify-between items-center">
                        <h3>Slack</h3>
                        <ToggleSwitch
                            id="slack"
                            {...updateSlackEnabled.fields.enabled.as(
                                "checkbox",
                                data?.slackEnabled ?? false,
                            )}
                            ariaLabel="Enable notifications"
                            disabled={isDemo() ||
                                !!updateSlackEnabled.pending}
                            onchange={() =>
                                submitWithIssueToast(updateSlackEnabled, () =>
                                    updateSlackEnabled.fields.enabled.set(
                                        data?.slackEnabled ?? false,
                                    ),
                                )}
                        />
                    </div>
                    <p>
                        Connect your Slack workspace to receive domain
                        notifications directly in your channels. You'll need to
                        create a Slack app and generate a webhook URL first. For
                        detailed instructions, follow this link: <a
                            href="https://api.slack.com/messaging/webhooks"
                            target="_blank"
                            title="Slack Webhooks Guide"
                            aria-label="Slack Webhooks Guide"
                            >Slack Webhooks Guide</a
                        >.
                    </p>
                </label>
            </form>
            {#if slackEnabled}
                <form
                    {...updateSlackWebhook
                        .preflight(slackWebhookSchema)
                        .enhance(submitWithToast)}
                    oninput={() =>
                        updateSlackWebhook.validate({ preflightOnly: true })}
                >
                    <div
                        class="grid gap-3"
                        transition:slide={{ duration: 600 }}
                    >
                        <hr class="mt-5!" />

                        <Input
                            type="text"
                            id="webhook"
                            placeholder="Enter Slack Webhook Url...."
                            label="Webhook"
                            tooltip="Your Slack Webhook URL for sending notifications. Create one in your Slack app settings. Example: https://hooks.slack.com/services/T05Q..."
                            disabled={isDemo() ||
                                !!updateSlackWebhook.pending}
                            variant={updateSlackWebhook.fields.webhook.issues()
                                ?.length
                                ? "error"
                                : "default"}
                            helperText={updateSlackWebhook.fields.webhook.issues()?.[0]
                                ?.message ?? ""}
                            {...updateSlackWebhook.fields.webhook.as(
                                "text",
                                data?.slackWebhookConfig?.webhook_url ?? "",
                            )}
                        />
                        <Input
                            id="notificationTime"
                            placeholder="Enter Slack Webhook Url...."
                            label="Notification time"
                            tooltip="Time for daily domain alerts - available domains and those expiring within 30 days."
                            disabled={isDemo() ||
                                !!updateSlackWebhook.pending}
                            variant={updateSlackWebhook.fields.notificationTime.issues()
                                ?.length
                                ? "error"
                                : "default"}
                            class="max-w-40"
                            helperText={updateSlackWebhook.fields.notificationTime.issues()?.[0]
                                ?.message ?? ""}
                            {...updateSlackWebhook.fields.notificationTime.as(
                                "time",
                                data?.slackWebhookConfig?.notification_time ??
                                    "",
                            )}
                        />
                        <div class="test">
                            <div class="grid gap-0.5">
                                <h6>Want to make sure everything’s working?</h6>
                                <p>
                                    We’ll send a quick test message to your
                                    Slack channel so you can confirm the
                                    connection.
                                </p>
                            </div>
                            <div class="save">
                                <div class="space-y-0.5">
                                    <div class="response">
                                        <div class="text">Status:</div>
                                        {#if data?.slackWebhookConfig?.connection_status === SLACK_CONNECTION_STATUS.CONNECTED}
                                            <div class="status status--valid">
                                                <div class="icon"></div>
                                                Connected and verified
                                            </div>
                                        {:else if data?.slackWebhookConfig?.connection_status === SLACK_CONNECTION_STATUS.DISCONNECTED}
                                            <div class="status status--invalid">
                                                <div class="icon"></div>
                                                Connection failed
                                            </div>
                                        {:else if data?.slackWebhookConfig?.connection_status === SLACK_CONNECTION_STATUS.SETUP_REQUIRED}
                                            <div class="status status--unknown">
                                                <div class="icon"></div>
                                                Setup required - Add your Webhook
                                                URL
                                            </div>
                                        {:else if data?.slackWebhookConfig?.connection_status === SLACK_CONNECTION_STATUS.READY}
                                            <div class="status status--ready">
                                                <div class="icon"></div>
                                                Ready for testing
                                            </div>
                                        {:else}
                                            <div class="status status--unknown">
                                                <div class="icon"></div>
                                                Status unknown
                                            </div>
                                        {/if}
                                    </div>
                                    <div class="response">
                                        <p class="text">
                                            Last verified: <span class="italic">
                                                {formatLastChecked(
                                                    data?.slackWebhookConfig
                                                        ?.connection_verified_at ??
                                                        null,
                                                ) || "Never"}</span
                                            >
                                        </p>
                                    </div>
                                </div>

                                <ToggleSwitch
                                    id="sendSlackTestMessage"
                                    {...updateSlackWebhook.fields.sendTestMessage.as(
                                        "checkbox",
                                    )}
                                    ariaLabel="Send Test Message"
                                    disabled={isDemo() ||
                                        !!updateSlackWebhook.pending}
                                />
                            </div>
                        </div>
                        <hr />
                        <div class="flex justify-end">
                            <Button
                                type="submit"
                                text={updateSlackWebhook.fields.sendTestMessage.value()
                                    ? "Test & Save Slack Changes"
                                    : "Save Changes"}
                                size="md"
                                color="white"
                                ariaLabel={updateSlackWebhook.fields.sendTestMessage.value()
                                    ? "Test & Save Slack Changes"
                                    : "Save Slack Changes"}
                                icon={isDemo()
                                    ? updateSlackWebhook.fields.sendTestMessage.value()
                                        ? "iconoir:send-diagonal"
                                        : "iconoir:save-floppy-disk"
                                    : updateSlackWebhook.pending
                                      ? "iconoir:refresh-double"
                                      : updateSlackWebhook.fields.sendTestMessage.value()
                                        ? "iconoir:send-diagonal"
                                        : "iconoir:save-floppy-disk"}
                                iconClass={updateSlackWebhook.pending
                                    ? "animate-spin"
                                    : ""}
                                disabled={isDemo() ||
                                    !!updateSlackWebhook.pending}
                            />
                        </div>
                    </div>
                </form>
            {/if}
        </div>

        <div class="black-bg-card">
            <form {...updateResendEnabled}>
                <label for="resend" class="space-y-1">
                    <div class="flex justify-between items-center">
                        <h3>Resend</h3>
                        <ToggleSwitch
                            id="resend"
                            {...updateResendEnabled.fields.enabled.as(
                                "checkbox",
                                data?.resendEnabled ?? false,
                            )}
                            ariaLabel="Enable notifications"
                            disabled={isDemo() ||
                                !!updateResendEnabled.pending}
                            onchange={() =>
                                submitWithIssueToast(updateResendEnabled, () =>
                                    updateResendEnabled.fields.enabled.set(
                                        data?.resendEnabled ?? false,
                                    ),
                                )}
                        />
                    </div>
                    <p>
                        Connect your Resend account to receive domain
                        notifications directly via email. You’ll need to create
                        an API key in your Resend dashboard first. For detailed
                        instructions, follow this link: <a
                            href="https://resend.com/docs/dashboard/api-keys/introduction"
                            target="_blank"
                            title="Resend API Documentation"
                            aria-label="Resend API Documentation"
                            >Resend API Documentation</a
                        >.
                    </p>
                </label>
            </form>

            {#if resendEnabled}
                <form
                    {...updateResendConfig
                        .preflight(resendSchema)
                        .enhance(submitWithToast)}
                    oninput={() =>
                        updateResendConfig.validate({ preflightOnly: true })}
                >
                    <div
                        class="grid gap-3"
                        transition:slide={{ duration: 600 }}
                    >
                        <hr class="mt-5!" />

                        <Input
                            type="text"
                            id="resendApiKey"
                            placeholder="Enter Resend API Key...."
                            label="API Key"
                            tooltip="Your Resend API key for sending emails. Get one from your Resend dashboard at resend.com. Example: re_AbCdE******"
                            disabled={isDemo() ||
                                !!updateResendConfig.pending}
                            variant={updateResendConfig.fields.apiKey.issues()
                                ?.length
                                ? "error"
                                : "default"}
                            helperText={updateResendConfig.fields.apiKey.issues()?.[0]
                                ?.message ?? ""}
                            {...updateResendConfig.fields.apiKey.as(
                                "text",
                                data?.resendConfig?.api_key ?? "",
                            )}
                        />

                        <Input
                            type="text"
                            id="fromEmail"
                            placeholder="Enter From Email..."
                            label="From Email"
                            tooltip="The sender email address that notifications will come from. Must be a verified domain in your Resend account. Example: notifications@yourdomain.com"
                            disabled={isDemo() ||
                                !!updateResendConfig.pending}
                            variant={updateResendConfig.fields.fromEmail.issues()
                                ?.length
                                ? "error"
                                : "default"}
                            helperText={updateResendConfig.fields.fromEmail.issues()?.[0]
                                ?.message ?? ""}
                            {...updateResendConfig.fields.fromEmail.as(
                                "text",
                                data?.resendConfig?.from_email ?? "",
                            )}
                        />

                        <Input
                            type="text"
                            id="toEmail"
                            placeholder="Enter To Email..."
                            label="To Email"
                            tooltip="The recipient email address where domain monitoring notifications will be sent. This should be your admin or notification email. Example: admin@yourdomain.com"
                            disabled={isDemo() ||
                                !!updateResendConfig.pending}
                            variant={updateResendConfig.fields.toEmail.issues()
                                ?.length
                                ? "error"
                                : "default"}
                            helperText={updateResendConfig.fields.toEmail.issues()?.[0]
                                ?.message ?? ""}
                            {...updateResendConfig.fields.toEmail.as(
                                "text",
                                data?.resendConfig?.to_email ?? "",
                            )}
                        />

                        <Input
                            id="resendNotificationTime"
                            placeholder="Enter Notification Time...."
                            label="Notification time"
                            tooltip="Time for daily domain alerts - available domains and those expiring within 30 days."
                            disabled={isDemo() ||
                                !!updateResendConfig.pending}
                            variant={updateResendConfig.fields.notificationTime.issues()
                                ?.length
                                ? "error"
                                : "default"}
                            class="max-w-40"
                            helperText={updateResendConfig.fields.notificationTime.issues()?.[0]
                                ?.message ?? ""}
                            {...updateResendConfig.fields.notificationTime.as(
                                "time",
                                data?.resendConfig?.notification_time ?? "",
                            )}
                        />

                        <div class="test">
                            <div class="grid gap-0.5">
                                <h6>Want to make sure everything’s working?</h6>
                                <p>
                                    We'll send a quick test email to confirm
                                    your setup is working and ready for
                                    notifications.
                                </p>
                            </div>
                            <div class="save">
                                <div class="space-y-0.5">
                                    <div class="response">
                                        <div class="text">Status:</div>
                                        {#if data?.resendConfig?.connection_status === RESEND_CONNECTION_STATUS.CONNECTED}
                                            <div class="status status--valid">
                                                <div class="icon"></div>
                                                Connected and verified
                                            </div>
                                        {:else if data?.resendConfig?.connection_status === RESEND_CONNECTION_STATUS.DISCONNECTED}
                                            <div class="status status--invalid">
                                                <div class="icon"></div>
                                                Connection failed
                                            </div>
                                        {:else if data?.resendConfig?.connection_status === RESEND_CONNECTION_STATUS.SETUP_REQUIRED}
                                            <div class="status status--unknown">
                                                <div class="icon"></div>
                                                Setup required - Add your Resend
                                                Config
                                            </div>
                                        {:else if data?.resendConfig?.connection_status === RESEND_CONNECTION_STATUS.READY}
                                            <div class="status status--ready">
                                                <div class="icon"></div>
                                                Ready for testing
                                            </div>
                                        {:else}
                                            <div class="status status--unknown">
                                                <div class="icon"></div>
                                                Status unknown
                                            </div>
                                        {/if}
                                    </div>
                                    <div class="response">
                                        <p class="text">
                                            Last verified: <span class="italic">
                                                {formatLastChecked(
                                                    data?.resendConfig
                                                        ?.connection_verified_at ??
                                                        null,
                                                ) || "Never"}</span
                                            >
                                        </p>
                                    </div>
                                </div>

                                <ToggleSwitch
                                    id="sendResendTestMessage"
                                    {...updateResendConfig.fields.sendTestMessage.as(
                                        "checkbox",
                                    )}
                                    ariaLabel="Send Test Message"
                                    disabled={isDemo() ||
                                        !!updateResendConfig.pending}
                                />
                            </div>
                        </div>
                        <hr />
                        <div class="flex justify-end">
                            <Button
                                type="submit"
                                text={updateResendConfig.fields.sendTestMessage.value()
                                    ? "Test & Save Resend Changes"
                                    : "Save Changes"}
                                size="md"
                                color="white"
                                ariaLabel={updateResendConfig.fields.sendTestMessage.value()
                                    ? "Test & Save Resend"
                                    : "Save Resend Changes"}
                                icon={isDemo()
                                    ? updateResendConfig.fields.sendTestMessage.value()
                                        ? "iconoir:send-diagonal"
                                        : "iconoir:save-floppy-disk"
                                    : updateResendConfig.pending
                                      ? "iconoir:refresh-double"
                                      : updateResendConfig.fields.sendTestMessage.value()
                                        ? "iconoir:send-diagonal"
                                        : "iconoir:save-floppy-disk"}
                                iconClass={updateResendConfig.pending
                                    ? "animate-spin"
                                    : ""}
                                disabled={isDemo() ||
                                    !!updateResendConfig.pending}
                            />
                        </div>
                    </div>
                </form>
            {/if}
        </div>
    </section>
</div>
