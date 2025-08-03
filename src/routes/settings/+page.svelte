<script>
    import Button from "$components/Button.svelte";
    import { superForm } from "sveltekit-superforms";
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

    //// PROPS ////
    let { data } = $props();

    //// SUPERFORMS ////
    const {
        form: apiKeyForm,
        errors: apiKeyErrors,
        constraints: apiKeyConstraints,
        message: apiKeyMessage,
        enhance: apiKeyEnhance,
        submitting: apiKeySubmitting,
    } = superForm(data?.formApiKey, {
        resetForm: false,
        onResult: ({ result }) => {
            if (result.type === "success" && result.data?.form?.message) {
                toast.show(result.data?.form?.message);
            }
        },
    });

    const { form: UIViewForm, enhance: UIViewEnhance } = superForm(
        data?.formUiView,
        {
            resetForm: false,
            onResult: ({ result }) => {
                if (result.type === "success" && result.data?.form?.message) {
                    toast.show(result.data?.form?.message);
                }
            },
        }
    );

    const {
        form: formSlackEnabledForm,
        enhance: formSlackEnabledEnhance,
        submitting: formSlackEnabledSubmitting,
        submit: formSlackEnabledSubmit,
    } = superForm(data?.formSlackEnabled, {
        resetForm: false,
        id: "slack-form-toggle",
        onResult: ({ result }) => {
            if (result.type === "success" && result.data?.form?.message) {
                toast.show(result.data?.form?.message);
            }
        },
    });

    const {
        form: slackWebHookForm,
        errors: slackWebHookErrors,
        constraints: slackWebHookConstraints,
        enhance: slackWebHookEnhance,
        submitting: slackWebHookSubmitting,
    } = superForm(data?.formSlackWebhook, {
        resetForm: false,
        invalidateAll: true,
        onResult: ({ result }) => {
            if (result.type === "success" && result.data?.form?.message) {
                toast.show(result.data?.form?.message);
            }
        },
    });

    const {
        form: formResendEnabledForm,
        enhance: formResendEnabledEnhance,
        submitting: formResendEnabledSubmitting,
        submit: formResendEnabledSubmit,
    } = superForm(data?.formResendEnabled, {
        resetForm: false,
        id: "resend-form-toggle",
        onResult: ({ result }) => {
            if (result.type === "success" && result.data?.form?.message) {
                toast.show(result.data?.form?.message);
            }
        },
    });

    const {
        form: formResendForm,
        errors: formResendErrors,
        constraints: formResendConstraints,
        enhance: formResendEnhance,
        submitting: formResendSubmitting,
    } = superForm(data?.formResend, {
        resetForm: false,
        onResult: ({ result }) => {
            if (result.type === "success" && result.data?.form?.message) {
                toast.show(result.data?.form?.message);
            }
        },
    });
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
            method="POST"
            action="?/saveApiKey"
            use:apiKeyEnhance
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
                name="apiKey"
                id="apiKey"
                placeholder="Enter WhoIsJson API Key...."
                label="API Key"
                tooltip="Your WhoisJson API key enables domain verification and monitoring. Get your free API key at whoisjson.com"
                disabled={isDemo() || $apiKeySubmitting}
                bind:value={$apiKeyForm.apiKey}
                variant={$apiKeyErrors.apiKey ? "error" : "default"}
                helperText={$apiKeyErrors.apiKey ? $apiKeyErrors.apiKey[0] : ""}
                {...$apiKeyConstraints.apiKey}
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
                                    data?.apiKeyConfig?.connection_verified_at
                                ) || "Never"}</span
                            >
                        </p>
                    </div>
                </div>

                <Button
                    type={isDemo() ? "button" : "submit"}
                    text="Test & Save API Key"
                    size="md"
                    color="white"
                    ariaLabel="Test & Save API Key"
                    icon={isDemo()
                        ? "iconoir:save-floppy-disk"
                        : $apiKeySubmitting
                          ? "iconoir:refresh-double"
                          : "iconoir:save-floppy-disk"}
                    iconClass={$apiKeySubmitting ? "animate-spin" : ""}
                    disabled={isDemo() || $apiKeySubmitting}
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
                method="POST"
                action="?/updateUIView"
                use:UIViewEnhance
            >
                <label for="compact-view" class="ui-view">
                    <RadioButton
                        name="viewMode"
                        id="compact-view"
                        value={UI_DOMAIN_VIEW.COMPACT}
                        bind:checked={$UIViewForm.viewMode}
                        disabled={isDemo() || $apiKeySubmitting}
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
                        name="viewMode"
                        id="detailed-view"
                        value={UI_DOMAIN_VIEW.DETAILED}
                        bind:checked={$UIViewForm.viewMode}
                        disabled={isDemo() || $apiKeySubmitting}
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
                            {#each Array(4) as _}
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
                        class="!hidden md:!flex"
                        disabled={isDemo() || $apiKeySubmitting}
                        onclick={() => {
                            $UIViewForm.viewMode = UI_DOMAIN_VIEW.COMPACT;
                        }}
                    />
                    <Button
                        type={isDemo() ? "button" : "submit"}
                        text="Save Changes"
                        size="md"
                        color="white"
                        ariaLabel="Save Changes"
                        icon={isDemo()
                            ? "iconoir:save-floppy-disk"
                            : $apiKeySubmitting
                              ? "iconoir:refresh-double"
                              : "iconoir:save-floppy-disk"}
                        iconClass={$apiKeySubmitting ? "animate-spin" : ""}
                        disabled={isDemo() || $apiKeySubmitting}
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
            <form
                method="POST"
                action="?/updateSlackEnabled"
                use:formSlackEnabledEnhance
            >
                <label for="slack" class="space-y-1">
                    <div class="flex justify-between items-center">
                        <h3>Slack</h3>
                        <ToggleSwitch
                            id="slack"
                            name="enabled"
                            bind:checked={$formSlackEnabledForm.enabled}
                            ariaLabel="Enable notifications"
                            disabled={isDemo() || $formSlackEnabledSubmitting}
                            onchange={() => {
                                $formSlackEnabledForm.enabled !==
                                    $formSlackEnabledForm.enabled;
                                formSlackEnabledSubmit();
                            }}
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
            {#if $formSlackEnabledForm.enabled}
                <form
                    method="POST"
                    action="?/updateSlackWebhook"
                    use:slackWebHookEnhance
                >
                    <div
                        class="grid gap-3"
                        transition:slide={{ duration: 600 }}
                    >
                        <hr class="!mt-5" />

                        <Input
                            type="text"
                            name="webhook"
                            id="webhook"
                            placeholder="Enter Slack Webhook Url...."
                            label="Webhook"
                            tooltip="Your Slack Webhook URL for sending notifications. Create one in your Slack app settings. Example: https://hooks.slack.com/services/T05Q..."
                            disabled={isDemo() || $slackWebHookSubmitting}
                            bind:value={$slackWebHookForm.webhook}
                            variant={$slackWebHookErrors.webhook
                                ? "error"
                                : "default"}
                            helperText={$slackWebHookErrors.webhook
                                ? $slackWebHookErrors.webhook[0]
                                : ""}
                            {...$slackWebHookConstraints.webhook}
                        />
                        <Input
                            type="time"
                            name="notificationTime"
                            id="notificationTime"
                            placeholder="Enter Slack Webhook Url...."
                            label="Notification time"
                            tooltip="Time for daily domain alerts - available domains and those expiring within 30 days."
                            disabled={isDemo() || $slackWebHookSubmitting}
                            bind:value={$slackWebHookForm.notificationTime}
                            variant={$slackWebHookErrors.notificationTime
                                ? "error"
                                : "default"}
                            class="max-w-40"
                            helperText={$slackWebHookErrors.notificationTime
                                ? $slackWebHookErrors.notificationTime[0]
                                : ""}
                            {...$slackWebHookConstraints.notificationTime}
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
                                                        ?.connection_verified_at
                                                ) || "Never"}</span
                                            >
                                        </p>
                                    </div>
                                </div>

                                <ToggleSwitch
                                    id="sendSlackTestMessage"
                                    name="sendTestMessage"
                                    bind:checked={
                                        $slackWebHookForm.sendTestMessage
                                    }
                                    ariaLabel="Send Test Message"
                                    disabled={isDemo() ||
                                        $formSlackEnabledSubmitting}
                                />
                            </div>
                        </div>
                        <hr />
                        <div class="flex justify-end">
                            <Button
                                type={isDemo() ? "button" : "submit"}
                                text={$slackWebHookForm.sendTestMessage
                                    ? "Test & Save Slack Changes"
                                    : "Save Changes"}
                                size="md"
                                color="white"
                                ariaLabel={$slackWebHookForm.sendTestMessage
                                    ? "Test & Save Slack Changes"
                                    : "Save Slack Changes"}
                                icon={isDemo()
                                    ? $slackWebHookForm.sendTestMessage
                                        ? "iconoir:send-diagonal"
                                        : "iconoir:save-floppy-disk"
                                    : $slackWebHookSubmitting
                                      ? "iconoir:refresh-double"
                                      : $slackWebHookForm.sendTestMessage
                                        ? "iconoir:send-diagonal"
                                        : "iconoir:save-floppy-disk"}
                                iconClass={$slackWebHookSubmitting
                                    ? "animate-spin"
                                    : ""}
                                disabled={isDemo() || $slackWebHookSubmitting}
                            />
                        </div>
                    </div>
                </form>
            {/if}
        </div>

        <div class="black-bg-card">
            <form
                method="POST"
                action="?/updateResendEnabled"
                use:formResendEnabledEnhance
            >
                <label for="resend" class="space-y-1">
                    <div class="flex justify-between items-center">
                        <h3>Resend</h3>
                        <ToggleSwitch
                            id="resend"
                            name="enabled"
                            bind:checked={$formResendEnabledForm.enabled}
                            ariaLabel="Enable notifications"
                            disabled={isDemo() || $formResendEnabledSubmitting}
                            onchange={() => {
                                $formResendEnabledForm.enabled !==
                                    $formResendEnabledForm.enabled;
                                formResendEnabledSubmit();
                            }}
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

            {#if $formResendEnabledForm.enabled}
                <form
                    method="POST"
                    action="?/updateResendKey"
                    use:formResendEnhance
                >
                    <div
                        class="grid gap-3"
                        transition:slide={{ duration: 600 }}
                    >
                        <hr class="!mt-5" />

                        <Input
                            type="text"
                            name="apiKey"
                            id="apiKey"
                            placeholder="Enter Resend API Key...."
                            label="API Key"
                            tooltip="Your Resend API key for sending emails. Get one from your Resend dashboard at resend.com. Example: re_AbCdE******"
                            disabled={isDemo() || $formResendSubmitting}
                            bind:value={$formResendForm.apiKey}
                            variant={$formResendErrors.apiKey
                                ? "error"
                                : "default"}
                            helperText={$formResendErrors.apiKey
                                ? $formResendErrors.apiKey[0]
                                : ""}
                            {...$formResendConstraints.apiKey}
                        />

                        <Input
                            type="text"
                            name="fromEmail"
                            id="fromEmail"
                            placeholder="Enter From Email..."
                            label="From Email"
                            tooltip="The sender email address that notifications will come from. Must be a verified domain in your Resend account. Example: notifications@yourdomain.com"
                            disabled={isDemo() || $formResendSubmitting}
                            bind:value={$formResendForm.fromEmail}
                            variant={$formResendErrors.fromEmail
                                ? "error"
                                : "default"}
                            helperText={$formResendErrors.fromEmail
                                ? $formResendErrors.fromEmail[0]
                                : ""}
                            {...$formResendConstraints.fromEmail}
                        />

                        <Input
                            type="text"
                            name="toEmail"
                            Email
                            id="toEmail"
                            placeholder="Enter To Email..."
                            label="To Email"
                            tooltip="The recipient email address where domain monitoring notifications will be sent. This should be your admin or notification email. Example: admin@yourdomain.com"
                            disabled={isDemo() || $formResendSubmitting}
                            bind:value={$formResendForm.toEmail}
                            variant={$formResendErrors.toEmail
                                ? "error"
                                : "default"}
                            helperText={$formResendErrors.toEmail
                                ? $formResendErrors.toEmail[0]
                                : ""}
                            {...$formResendConstraints.toEmail}
                        />

                        <Input
                            type="time"
                            name="notificationTime"
                            id="notificationTime"
                            placeholder="Enter Slack Webhook Url...."
                            label="Notification time"
                            tooltip="Time for daily domain alerts - available domains and those expiring within 30 days."
                            disabled={isDemo() || $formResendSubmitting}
                            bind:value={$formResendForm.notificationTime}
                            variant={$formResendErrors.notificationTime
                                ? "error"
                                : "default"}
                            class="max-w-40"
                            helperText={$formResendErrors.notificationTime
                                ? $formResendErrors.notificationTime[0]
                                : ""}
                            {...$formResendConstraints.notificationTime}
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
                                                        ?.connection_verified_at
                                                ) || "Never"}</span
                                            >
                                        </p>
                                    </div>
                                </div>

                                <ToggleSwitch
                                    id="sendResendTestMessage"
                                    name="sendTestMessage"
                                    bind:checked={
                                        $formResendForm.sendTestMessage
                                    }
                                    ariaLabel="Send Test Message"
                                    disabled={isDemo() || $formResendSubmitting}
                                />
                            </div>
                        </div>
                        <hr />
                        <div class="flex justify-end">
                            <Button
                                type={isDemo() ? "button" : "submit"}
                                text={$formResendForm.sendTestMessage
                                    ? "Test & Save Resend Changes"
                                    : "Save Changes"}
                                size="md"
                                color="white"
                                ariaLabel={$formResendForm.sendTestMessage
                                    ? "Test & Save Resend"
                                    : "Save Resend Changes"}
                                icon={isDemo()
                                    ? $formResendForm.sendTestMessage
                                        ? "iconoir:send-diagonal"
                                        : "iconoir:save-floppy-disk"
                                    : $formResendSubmitting
                                      ? "iconoir:refresh-double"
                                      : $formResendForm.sendTestMessage
                                        ? "iconoir:send-diagonal"
                                        : "iconoir:save-floppy-disk"}
                                iconClass={$formResendSubmitting
                                    ? "animate-spin"
                                    : ""}
                                disabled={isDemo() || $formResendSubmitting}
                            />
                        </div>
                    </div>
                </form>
            {/if}
        </div>
    </section>
</div>
