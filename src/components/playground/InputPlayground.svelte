<script>
    import Input from "$components/Input.svelte";

    // All possible prop combinations
    const types = ["text", "email", "password", "number", "tel", "url"];
    const variants = ["default", "error", "success"];
    const tooltipIcons = [
        "iconoir:info-circle",
        "iconoir:question-mark-circle",
        "iconoir:warning-triangle",
    ];

    // Input types to test
    const inputTypes = [
        { type: "basic", label: "Basic Input" },
        { type: "with-label", label: "With Label" },
        { type: "with-tooltip", label: "With Tooltip" },
        { type: "with-helper", label: "With Helper Text" },
        { type: "complete", label: "Complete (All Props)" },
    ];

    // Sample data for testing
    const sampleData = {
        labels: [
            "Email address",
            "Password",
            "Full Name",
            "Phone Number",
            "Website URL",
        ],
        placeholders: [
            "Enter your email...",
            "Type your password...",
            "Your full name",
            "123-456-7890",
            "https://example.com",
        ],
        tooltips: [
            "We'll never share your email",
            "Must be at least 8 characters",
            "First and last name",
            "Include country code",
            "Must be a valid URL",
        ],
        helperTexts: [
            "This field is required",
            "Password is too weak",
            "Looks good!",
            "Invalid format",
            "Please check the URL",
        ],
    };

    // Generate combinations organized by type and variant
    let combinationsByTypeAndVariant = {};
    let inputValues = {}; // Store values for each input

    for (let inputType of inputTypes) {
        combinationsByTypeAndVariant[inputType.type] = {};

        for (let variant of variants) {
            combinationsByTypeAndVariant[inputType.type][variant] = [];

            for (let type of types) {
                const config = generateInputConfig(
                    inputType.type,
                    variant,
                    type
                );
                const uniqueId = `${inputType.type}-${variant}-${type}-${Date.now()}-${Math.random()}`;

                combinationsByTypeAndVariant[inputType.type][variant].push({
                    ...config,
                    uniqueId,
                    description: `type="${type}", variant="${variant}"${getAdditionalPropsDescription(config)}`,
                });

                // Initialize input value
                inputValues[uniqueId] = "";
            }
        }
    }

    function generateInputConfig(inputTypeKey, variant, type) {
        const baseConfig = {
            type,
            variant,
            disabled: false,
            required: false,
        };

        const randomIndex = Math.floor(
            Math.random() * sampleData.labels.length
        );

        switch (inputTypeKey) {
            case "basic":
                return {
                    ...baseConfig,
                    placeholder: sampleData.placeholders[randomIndex],
                };

            case "with-label":
                return {
                    ...baseConfig,
                    label: sampleData.labels[randomIndex],
                    placeholder: sampleData.placeholders[randomIndex],
                    required: Math.random() > 0.5,
                };

            case "with-tooltip":
                return {
                    ...baseConfig,
                    label: sampleData.labels[randomIndex],
                    placeholder: sampleData.placeholders[randomIndex],
                    tooltip: sampleData.tooltips[randomIndex],
                    tooltipIcon:
                        tooltipIcons[randomIndex % tooltipIcons.length],
                    required: Math.random() > 0.7,
                };

            case "with-helper":
                return {
                    ...baseConfig,
                    label: sampleData.labels[randomIndex],
                    placeholder: sampleData.placeholders[randomIndex],
                    helperText: sampleData.helperTexts[randomIndex],
                    required: Math.random() > 0.6,
                };

            case "complete":
                return {
                    ...baseConfig,
                    label: sampleData.labels[randomIndex],
                    placeholder: sampleData.placeholders[randomIndex],
                    tooltip: sampleData.tooltips[randomIndex],
                    tooltipIcon:
                        tooltipIcons[randomIndex % tooltipIcons.length],
                    helperText: sampleData.helperTexts[randomIndex],
                    required: true,
                };

            default:
                return baseConfig;
        }
    }

    function getAdditionalPropsDescription(config) {
        const props = [];
        if (config.label) props.push(`label="${config.label}"`);
        if (config.tooltip) props.push("tooltip");
        if (config.helperText) props.push("helperText");
        if (config.required) props.push("required");
        return props.length > 0 ? `, ${props.join(", ")}` : "";
    }

    // Split into groups of 3 for better layout
    function chunkArray(array, size) {
        const chunks = [];
        for (let i = 0; i < array.length; i += size) {
            chunks.push(array.slice(i, i + size));
        }
        return chunks;
    }

    function handleInput(uniqueId, event) {
        inputValues[uniqueId] = event.target.value;
        console.log(`Input ${uniqueId} changed:`, event.target.value);
    }

    function resetAllValues() {
        Object.keys(inputValues).forEach((key) => {
            inputValues[key] = "";
        });
        console.log("All input values reset");
    }

    function logAllValues() {
        console.log("Current input values:", inputValues);
        alert(
            `Check console for all ${Object.keys(inputValues).length} input values`
        );
    }
</script>

<div class="card">
    <div class="max-w-7xl mx-auto">
        <div class="flex justify-between items-center mb-8">
            <div>
                <h1 class="text-3xl font-medium mb-8">
                    Complete Input Component Testing
                </h1>
                <p class="opacity-70 mb-8">
                    Testing all input combinations: Basic, With Label, With
                    Tooltip, With Helper Text, and Complete - organized by input
                    type and variant.
                </p>
            </div>
            <div class="flex gap-2">
                <button
                    class="px-4 py-2 bg-blue text-white rounded-lg hover:bg-blue-700 transition-colors"
                    onclick={logAllValues}
                >
                    Log All Values
                </button>
                <button
                    class="px-4 py-2 bg-red text-white rounded-lg hover:bg-red-700 transition-colors"
                    onclick={resetAllValues}
                >
                    Reset All
                </button>
            </div>
        </div>

        {#each inputTypes as inputType}
            <div class="mb-16">
                <h2
                    class="text-3xl font-medium mb-8 uppercase border-b-2 border-gray-300 pb-4"
                >
                    {inputType.label}
                </h2>

                {#each variants as variant}
                    <div class="mb-10">
                        <h3
                            class="text-xl font-semibold mb-6 flex items-center gap-3"
                        >
                            <span
                                class="bg-{variant === 'default'
                                    ? 'blue'
                                    : variant === 'error'
                                      ? 'red'
                                      : 'green'}-100 text-{variant === 'default'
                                    ? 'blue'
                                    : variant === 'error'
                                      ? 'red'
                                      : 'green'}-600 px-3 py-1 rounded-full text-sm font-medium capitalize"
                            >
                                {variant} Variant
                            </span>
                            <span class="text-sm opacity-70">
                                ({combinationsByTypeAndVariant[inputType.type][
                                    variant
                                ].length} combinations)
                            </span>
                        </h3>

                        {#each chunkArray(combinationsByTypeAndVariant[inputType.type][variant], 3) as group}
                            <div class="mb-6">
                                <div
                                    class="grid grid-cols-1 lg:grid-cols-3 gap-6"
                                >
                                    {#each group as test}
                                        <div
                                            class="flex flex-col items-center gap-3 p-4 bg-white shadow-button-white rounded-2xl"
                                        >
                                            <div class="w-full">
                                                <Input
                                                    type={test.type}
                                                    variant={test.variant}
                                                    label={test.label || ""}
                                                    placeholder={test.placeholder ||
                                                        ""}
                                                    tooltip={test.tooltip || ""}
                                                    tooltipIcon={test.tooltipIcon ||
                                                        "iconoir:info-circle"}
                                                    helperText={test.helperText ||
                                                        ""}
                                                    required={test.required ||
                                                        false}
                                                    disabled={test.disabled ||
                                                        false}
                                                    bind:value={
                                                        inputValues[
                                                            test.uniqueId
                                                        ]
                                                    }
                                                    oninput={(e) =>
                                                        handleInput(
                                                            test.uniqueId,
                                                            e
                                                        )}
                                                />
                                            </div>

                                            <div
                                                class="border-t border-black/10 pt-4"
                                            >
                                                <code
                                                    class="text-xs text-black/60 bg-black/10 px-2 py-1 rounded-lg text-center leading-relaxed max-w-full break-all block"
                                                >
                                                    {test.description}
                                                </code>
                                                {#if inputValues[test.uniqueId]}
                                                    <div
                                                        class="mt-2 text-xs opacity-50"
                                                    >
                                                        <strong>Value:</strong>
                                                        "{inputValues[
                                                            test.uniqueId
                                                        ]}"
                                                    </div>
                                                {/if}
                                            </div>
                                        </div>
                                    {/each}
                                </div>
                            </div>
                        {/each}
                    </div>
                {/each}
            </div>
        {/each}

        <!-- Disabled state examples -->
        <div class="mb-16">
            <h2
                class="text-3xl font-medium mb-8 uppercase border-b-2 border-gray-300 pb-4"
            >
                Disabled States
            </h2>

            <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {#each types.slice(0, 6) as type, index}
                    <div
                        class="flex flex-col items-center gap-3 p-4 bg-white shadow-button-white rounded-2xl"
                    >
                        <div class="min-h-[120px] flex flex-col justify-center">
                            <Input
                                {type}
                                label={sampleData.labels[
                                    index % sampleData.labels.length
                                ]}
                                placeholder={sampleData.placeholders[
                                    index % sampleData.placeholders.length
                                ]}
                                tooltip={sampleData.tooltips[
                                    index % sampleData.tooltips.length
                                ]}
                                helperText="This field is disabled"
                                required={true}
                                disabled={true}
                                value="Disabled input"
                            />
                        </div>
                        <div class="border-t border-gray-100 pt-4">
                            <code
                                class="text-xs text-black/60 bg-black/10 px-2 py-1 rounded-lg text-center leading-relaxed max-w-full break-all block"
                            >
                                type="{type}", disabled=true, required=true
                            </code>
                        </div>
                    </div>
                {/each}
            </div>
        </div>

        <!-- Summary -->
        <div class="bg-blue/10 p-6 rounded-2xl">
            <h3 class="text-lg font-medium text-blue mb-4">Test Summary</h3>
            <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div>
                    <h4 class="font-medium text-black mb-2">Input Types:</h4>
                    <ul class="space-y-1 text-sm opacity-70">
                        {#each types as type}
                            <li>
                                <code
                                    class="bg-blue/10 px-2 py-1 rounded text-xs"
                                    >{type}</code
                                >
                            </li>
                        {/each}
                    </ul>
                </div>
                <div>
                    <h4 class="font-medium text-black mb-2">Variants:</h4>
                    <ul class="space-y-1 text-sm opacity-70">
                        {#each variants as variant}
                            <li>
                                <code
                                    class="bg-blue-100 px-2 py-1 rounded text-xs"
                                    >{variant}</code
                                >
                            </li>
                        {/each}
                    </ul>
                </div>
                <div>
                    <h4 class="font-medium text-black mb-2">
                        Features Tested:
                    </h4>
                    <ul class="space-y-1 text-sm opacity-70">
                        <li>✅ Labels with tooltips</li>
                        <li>✅ Helper text variants</li>
                        <li>✅ Required field indicators</li>
                        <li>✅ Disabled states</li>
                        <li>✅ Two-way data binding</li>
                        <li>✅ Responsive layout</li>
                    </ul>
                </div>
            </div>
            <div class="mt-4 pt-4 border-t border-black/10">
                <p class="font-medium">
                    <strong>Total combinations tested:</strong>
                    {Object.values(combinationsByTypeAndVariant)
                        .flatMap((typeObj) => Object.values(typeObj))
                        .flat().length} regular + {types.slice(0, 6).length} disabled
                    states
                </p>
                <p class="font-medium">
                    Each input maintains its own state and can be tested
                    independently. Use the "Log All Values" button to see
                    current input values in the console.
                </p>
            </div>
        </div>
    </div>
</div>
