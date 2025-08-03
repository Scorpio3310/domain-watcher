<script>
    import RadioButton from "$components/RadioButton.svelte";

    // All possible prop combinations
    const sizes = ["sm", "md", "lg"];
    const variants = ["primary", "secondary"];
    const iconCombinations = [
        { checked: "iconoir:check", unchecked: "" },
        { checked: "iconoir:check", unchecked: "iconoir:circle" },
        { checked: "iconoir:heart-solid", unchecked: "iconoir:heart" },
        { checked: "iconoir:star-solid", unchecked: "iconoir:star" },
        { checked: "iconoir:thumb-up", unchecked: "iconoir:thumb-down" },
        { checked: "iconoir:eye", unchecked: "iconoir:eye-off" },
    ];

    // Radio button types to test
    const radioTypes = [
        { type: "basic", label: "Basic Radio Buttons", groupSuffix: "basic" },
        {
            type: "with-icons",
            label: "With Custom Icons",
            groupSuffix: "icons",
        },
        { type: "mixed-sizes", label: "Mixed Sizes", groupSuffix: "mixed" },
        {
            type: "variants",
            label: "Different Variants",
            groupSuffix: "variants",
        },
        {
            type: "complete",
            label: "Complete (All Props)",
            groupSuffix: "complete",
        },
    ];

    // Sample data for testing
    const sampleData = {
        options: ["Option A", "Option B", "Option C", "Option D", "Option E"],
        ariaLabels: [
            "Select first option",
            "Select second option",
            "Select third option",
            "Select fourth option",
            "Select fifth option",
        ],
        groupNames: [
            "preferences",
            "settings",
            "choices",
            "selection",
            "options",
        ],
    };

    // Generate radio button groups organized by type and variant
    let groupsByTypeAndVariant = {};
    let groupValues = {}; // Store selected values for each group

    for (let radioType of radioTypes) {
        groupsByTypeAndVariant[radioType.type] = {};

        for (let variant of variants) {
            groupsByTypeAndVariant[radioType.type][variant] = [];

            for (let size of sizes) {
                const group = generateRadioGroup(
                    radioType.type,
                    variant,
                    size,
                    radioType.groupSuffix
                );
                const groupId = `${radioType.type}-${variant}-${size}-${Date.now()}-${Math.random()}`;

                groupsByTypeAndVariant[radioType.type][variant].push({
                    ...group,
                    groupId,
                    description: `size="${size}", variant="${variant}"${getAdditionalPropsDescription(group)}`,
                });

                // Initialize group value
                groupValues[group.name] = group.options[0]?.value || "";
            }
        }
    }

    function generateRadioGroup(radioTypeKey, variant, size, groupSuffix) {
        const baseGroupName = `${groupSuffix}-${variant}-${size}-${Math.random().toString(36).substr(2, 5)}`;

        switch (radioTypeKey) {
            case "basic":
                return {
                    name: baseGroupName,
                    variant,
                    size,
                    options: sampleData.options
                        .slice(0, 3)
                        .map((option, index) => ({
                            id: `${baseGroupName}-${index}`,
                            value: `value-${index}`,
                            label: option,
                            checkedIcon: "iconoir:check",
                            uncheckedIcon: "",
                            ariaLabel: sampleData.ariaLabels[index],
                            disabled: false,
                        })),
                };

            case "with-icons":
                const iconSet =
                    iconCombinations[
                        Math.floor(Math.random() * iconCombinations.length)
                    ];
                return {
                    name: baseGroupName,
                    variant,
                    size,
                    options: sampleData.options
                        .slice(0, 4)
                        .map((option, index) => ({
                            id: `${baseGroupName}-${index}`,
                            value: `value-${index}`,
                            label: option,
                            checkedIcon: iconSet.checked,
                            uncheckedIcon: iconSet.unchecked,
                            ariaLabel: sampleData.ariaLabels[index],
                            disabled: false,
                        })),
                };

            case "mixed-sizes":
                return {
                    name: baseGroupName,
                    variant,
                    size: "mixed",
                    options: sampleData.options
                        .slice(0, 3)
                        .map((option, index) => ({
                            id: `${baseGroupName}-${index}`,
                            value: `value-${index}`,
                            label: option,
                            size: sizes[index % sizes.length],
                            checkedIcon: "iconoir:check",
                            uncheckedIcon: "",
                            ariaLabel: sampleData.ariaLabels[index],
                            disabled: false,
                        })),
                };

            case "variants":
                return {
                    name: baseGroupName,
                    variant: "mixed",
                    size,
                    options: sampleData.options
                        .slice(0, 2)
                        .map((option, index) => ({
                            id: `${baseGroupName}-${index}`,
                            value: `value-${index}`,
                            label: option,
                            variant: variants[index % variants.length],
                            checkedIcon: "iconoir:check",
                            uncheckedIcon: "",
                            ariaLabel: sampleData.ariaLabels[index],
                            disabled: false,
                        })),
                };

            case "complete":
                const randomIcon =
                    iconCombinations[
                        Math.floor(Math.random() * iconCombinations.length)
                    ];
                return {
                    name: baseGroupName,
                    variant,
                    size,
                    options: sampleData.options
                        .slice(0, 5)
                        .map((option, index) => ({
                            id: `${baseGroupName}-${index}`,
                            value: `value-${index}`,
                            label: option,
                            checkedIcon: randomIcon.checked,
                            uncheckedIcon: randomIcon.unchecked,
                            ariaLabel: sampleData.ariaLabels[index],
                            disabled: index === 2, // Disable middle option
                        })),
                };

            default:
                return {
                    name: baseGroupName,
                    variant,
                    size,
                    options: [],
                };
        }
    }

    function getAdditionalPropsDescription(group) {
        const props = [];
        if (group.options[0]?.uncheckedIcon) props.push("custom icons");
        if (group.size === "mixed") props.push("mixed sizes");
        if (group.variant === "mixed") props.push("mixed variants");
        if (group.options.some((opt) => opt.disabled))
            props.push("disabled options");
        return props.length > 0 ? `, ${props.join(", ")}` : "";
    }

    function handleGroupChange(groupName, value) {
        groupValues[groupName] = value;
        console.log(`Radio group ${groupName} changed:`, value);
    }

    function resetAllValues() {
        Object.keys(groupValues).forEach((key) => {
            // Set to first option of each group
            const firstOption = Object.values(groupsByTypeAndVariant)
                .flatMap((type) => Object.values(type))
                .flat()
                .find((group) => group.name === key)?.options[0];
            groupValues[key] = firstOption?.value || "";
        });
        console.log("All radio group values reset");
    }

    function logAllValues() {
        console.log("Current radio group values:", groupValues);
        alert(
            `Check console for all ${Object.keys(groupValues).length} radio group values`
        );
    }

    function randomizeAllValues() {
        Object.keys(groupValues).forEach((groupName) => {
            const group = Object.values(groupsByTypeAndVariant)
                .flatMap((type) => Object.values(type))
                .flat()
                .find((g) => g.name === groupName);

            if (group && group.options.length > 0) {
                const enabledOptions = group.options.filter(
                    (opt) => !opt.disabled
                );
                const randomOption =
                    enabledOptions[
                        Math.floor(Math.random() * enabledOptions.length)
                    ];
                groupValues[groupName] = randomOption.value;
            }
        });
        console.log("All radio group values randomized");
    }

    // Split into groups of 2 for better layout
    function chunkArray(array, size) {
        const chunks = [];
        for (let i = 0; i < array.length; i += size) {
            chunks.push(array.slice(i, i + size));
        }
        return chunks;
    }
</script>

<div class="card">
    <div class="max-w-7xl mx-auto">
        <div class="flex justify-between items-center mb-8">
            <div>
                <h1 class="text-3xl font-medium mb-8">
                    Complete RadioButton Component Testing
                </h1>
                <p class="opacity-70 mb-8">
                    Testing all radio button combinations: Basic, With Custom
                    Icons, Mixed Sizes, Different Variants, and Complete -
                    organized by type and variant.
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
                    class="px-4 py-2 bg-green text-white rounded-lg hover:bg-green-700 transition-colors"
                    onclick={randomizeAllValues}
                >
                    Randomize All
                </button>
                <button
                    class="px-4 py-2 bg-red text-white rounded-lg hover:bg-red-700 transition-colors"
                    onclick={resetAllValues}
                >
                    Reset All
                </button>
            </div>
        </div>

        {#each radioTypes as radioType}
            <div class="mb-20">
                <h2
                    class="text-3xl font-medium mb-8 uppercase border-b-2 border-gray-300 pb-4"
                >
                    {radioType.label}
                </h2>

                {#each variants as variant}
                    <div class="mb-8">
                        <h3 class="text-xl mb-4 flex items-center gap-2">
                            <span
                                class="bg-{variant === 'primary'
                                    ? 'blue'
                                    : 'gray'}-100 text-{variant === 'primary'
                                    ? 'blue'
                                    : 'gray'}-800 px-3 py-1 rounded-full text-sm font-medium capitalize"
                            >
                                {variant} Variant
                            </span>
                            <span class="text-sm opacity-70">
                                ({groupsByTypeAndVariant[radioType.type][
                                    variant
                                ].length} groups)
                            </span>
                        </h3>

                        {#each chunkArray(groupsByTypeAndVariant[radioType.type][variant], 2) as groupChunk}
                            <div class="mb-6">
                                <div
                                    class="grid grid-cols-1 lg:grid-cols-2 gap-8"
                                >
                                    {#each groupChunk as group}
                                        <div
                                            class="flex flex-col gap-4 p-6 bg-white shadow-button-white rounded-2xl"
                                        >
                                            <div
                                                class="flex flex-wrap gap-3 items-center"
                                            >
                                                {#each group.options as option}
                                                    <div
                                                        class="flex items-center gap-2"
                                                    >
                                                        <RadioButton
                                                            name={group.name}
                                                            id={option.id}
                                                            value={option.value}
                                                            bind:checked={
                                                                groupValues[
                                                                    group.name
                                                                ]
                                                            }
                                                            checkedIcon={option.checkedIcon}
                                                            uncheckedIcon={option.uncheckedIcon}
                                                            size={option.size ||
                                                                group.size}
                                                            variant={option.variant ||
                                                                group.variant}
                                                            disabled={option.disabled}
                                                            ariaLabel={option.ariaLabel}
                                                            onchange={(value) =>
                                                                handleGroupChange(
                                                                    group.name,
                                                                    value
                                                                )}
                                                        />
                                                        <label
                                                            for={option.id}
                                                            class="text-sm opacity-70 cursor-pointer {option.disabled
                                                                ? 'opacity-50'
                                                                : ''}"
                                                        >
                                                            {option.label}
                                                        </label>
                                                    </div>
                                                {/each}
                                            </div>

                                            <div
                                                class="border-t border-black/10 pt-4"
                                            >
                                                <code
                                                    class="text-xs text-black/60 bg-black/10 px-2 py-1 rounded-lg text-center leading-relaxed max-w-full break-all block"
                                                >
                                                    {group.description}
                                                </code>
                                                <div
                                                    class="mt-2 text-xs opacity-50"
                                                >
                                                    <strong>Group:</strong>
                                                    "{group.name}"
                                                    <br />
                                                    <strong>Selected:</strong>
                                                    "{groupValues[group.name]}"
                                                </div>
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

        <!-- Keyboard Navigation Demo -->
        <div class="mb-6">
            <h2
                class="text-3xl font-medium mb-8 uppercase border-b-2 border-gray-300 pb-4"
            >
                Keyboard Navigation Demo
            </h2>
            <div class="bg-blue/10 p-6 rounded-2xl mb-6">
                <h3 class="text-lg font-medium text-blue mb-4">
                    How to test keyboard navigation:
                </h3>
                <div class="grid md:grid-cols-2 gap-6 text-sm opacity-70">
                    <div>
                        <h4 class="font-medium mb-2">Keyboard Controls:</h4>
                        <ul class="space-y-1">
                            <li>
                                <kbd
                                    class="bg-blue-200 px-2 py-1 rounded text-xs"
                                    >Tab</kbd
                                > - Focus radio group
                            </li>
                            <li>
                                <kbd
                                    class="bg-blue-200 px-2 py-1 rounded text-xs"
                                    >↑ ↓ ← →</kbd
                                > - Navigate + select
                            </li>
                            <li>
                                <kbd
                                    class="bg-blue-200 px-2 py-1 rounded text-xs"
                                    >Space</kbd
                                > - Select focused radio
                            </li>
                            <li>
                                <kbd
                                    class="bg-blue-200 px-2 py-1 rounded text-xs"
                                    >Enter</kbd
                                > - Select focused radio
                            </li>
                        </ul>
                    </div>
                    <div>
                        <h4 class="font-medium mb-2">Test Features:</h4>
                        <ul class="space-y-1">
                            <li>✅ Focus indicators</li>
                            <li>✅ Arrow key navigation</li>
                            <li>✅ Skip disabled options</li>
                            <li>✅ Circular navigation</li>
                        </ul>
                    </div>
                </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div class="p-6 bg-white shadow-button-white rounded-2xl">
                    <h4 class="font-medium mb-4">Small Buttons</h4>
                    <div class="flex flex-col gap-3">
                        {#each ["keyboard-sm-1", "keyboard-sm-2", "keyboard-sm-3"] as value, index}
                            <div class="flex items-center gap-2">
                                <RadioButton
                                    name="keyboard-demo-sm"
                                    id="kbd-sm-{index}"
                                    {value}
                                    bind:checked={
                                        groupValues["keyboard-demo-sm"]
                                    }
                                    size="sm"
                                    variant="primary"
                                    ariaLabel="Keyboard demo option {index + 1}"
                                />
                                <label
                                    for="kbd-sm-{index}"
                                    class="text-sm cursor-pointer"
                                >
                                    Option {index + 1}
                                </label>
                            </div>
                        {/each}
                    </div>
                </div>

                <div class="p-6 bg-white shadow-button-white rounded-2xl">
                    <h4 class="font-medium mb-4">Medium Buttons</h4>
                    <div class="flex flex-col gap-3">
                        {#each ["keyboard-md-1", "keyboard-md-2", "keyboard-md-3", "keyboard-md-4"] as value, index}
                            <div class="flex items-center gap-2">
                                <RadioButton
                                    name="keyboard-demo-md"
                                    id="kbd-md-{index}"
                                    {value}
                                    bind:checked={
                                        groupValues["keyboard-demo-md"]
                                    }
                                    size="md"
                                    variant="secondary"
                                    disabled={index === 2}
                                    ariaLabel="Keyboard demo option {index + 1}"
                                />
                                <label
                                    for="kbd-md-{index}"
                                    class="text-sm opacity-70 cursor-pointer {index ===
                                    2
                                        ? 'opacity-50'
                                        : ''}"
                                >
                                    Option {index + 1}
                                    {index === 2 ? "(Disabled)" : ""}
                                </label>
                            </div>
                        {/each}
                    </div>
                </div>

                <div class="p-6 bg-white shadow-button-white rounded-2xl">
                    <h4 class="font-medium mb-4">Large Buttons</h4>
                    <div class="flex flex-col gap-3">
                        {#each ["keyboard-lg-1", "keyboard-lg-2", "keyboard-lg-3"] as value, index}
                            <div class="flex items-center gap-2">
                                <RadioButton
                                    name="keyboard-demo-lg"
                                    id="kbd-lg-{index}"
                                    {value}
                                    bind:checked={
                                        groupValues["keyboard-demo-lg"]
                                    }
                                    size="lg"
                                    variant="primary"
                                    checkedIcon="iconoir:star-solid"
                                    uncheckedIcon="iconoir:star"
                                    ariaLabel="Keyboard demo option {index + 1}"
                                />
                                <label
                                    for="kbd-lg-{index}"
                                    class="text-sm opacity-70 cursor-pointer"
                                >
                                    Option {index + 1}
                                </label>
                            </div>
                        {/each}
                    </div>
                </div>
            </div>
        </div>

        <!-- Summary -->
        <div class="bg-blue/10 p-6 rounded-2xl">
            <h3 class="text-lg font-medium text-blue mb-4">Test Summary</h3>
            <div class="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div>
                    <h4 class="font-medium text-black mb-2">Sizes:</h4>
                    <ul class="text-blue-700 space-y-1 text-sm">
                        {#each sizes as size}
                            <li>
                                <code
                                    class="bg-blue-100 px-2 py-1 rounded text-xs"
                                    >{size}</code
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
                    <h4 class="font-medium text-black mb-2">Icon Sets:</h4>
                    <ul class="space-y-1 text-sm opacity-70">
                        <li>✅ Check / Circle</li>
                        <li>❤️ Heart / Outline</li>
                        <li>⭐ Star / Outline</li>
                        <li>👍 Thumb Up/Down</li>
                        <li>👁️ Eye / Eye Off</li>
                    </ul>
                </div>
                <div>
                    <h4 class="font-medium text-black mb-2">
                        Features Tested:
                    </h4>
                    <ul class="space-y-1 text-sm opacity-70">
                        <li>✅ Radio group binding</li>
                        <li>✅ Custom icons</li>
                        <li>✅ Disabled states</li>
                        <li>✅ Mixed sizes/variants</li>
                        <li>✅ Keyboard navigation</li>
                        <li>✅ Accessibility</li>
                    </ul>
                </div>
            </div>
            <div class="mt-4 pt-4 border-t border-black/10">
                <p class="font-medium">
                    <strong>Total radio groups tested:</strong>
                    {Object.keys(groupValues).length} groups with multiple options
                    each
                </p>
                <p class="font-medium">
                    Each radio group maintains its own state and can be tested
                    independently. Use keyboard navigation to test accessibility
                    features.
                </p>
            </div>
        </div>
    </div>
</div>
