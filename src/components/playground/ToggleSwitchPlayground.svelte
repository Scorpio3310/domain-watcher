<script>
    import ToggleSwitch from "$components/ToggleSwitch.svelte";

    // All possible prop combinations
    const sizes = ["lg", "md", "sm"];
    const variants = ["primary", "secondary"];
    const icons = [
        { checked: "iconoir:check", unchecked: "" },
        { checked: "iconoir:eye", unchecked: "iconoir:eye-off" },
        { checked: "iconoir:check", unchecked: "iconoir:xmark" },
        { checked: "iconoir:check", unchecked: "iconoir:cross" },
        { checked: "", unchecked: "" }, // No icons
    ];

    // Toggle types to test
    const toggleTypes = [
        { type: "no-icons", label: "No Icons" },
        { type: "checked-only", label: "Checked Icon Only" },
        { type: "both-icons", label: "Both Icons" },
    ];

    // Generate combinations organized by size and type
    let combinationsBySizeAndType = {};
    let globalIndex = 0; // Globalni števec za unikatne ID-je

    for (let size of sizes) {
        combinationsBySizeAndType[size] = {};

        for (let toggleType of toggleTypes) {
            combinationsBySizeAndType[size][toggleType.type] = [];

            for (let variant of variants) {
                if (toggleType.type === "no-icons") {
                    // No icons
                    combinationsBySizeAndType[size][toggleType.type].push({
                        size,
                        variant,
                        checkedIcon: "",
                        uncheckedIcon: "",
                        checked: false,
                        description: `size="${size}", variant="${variant}"`,
                        label: `${size.toUpperCase()} ${variant}`,
                        uniqueId: `toggle-${globalIndex++}`, // Unikatni ID
                    });
                } else if (toggleType.type === "checked-only") {
                    // Only checked icon
                    for (let iconSet of icons.filter((i) => i.checked !== "")) {
                        combinationsBySizeAndType[size][toggleType.type].push({
                            size,
                            variant,
                            checkedIcon: iconSet.checked,
                            uncheckedIcon: "",
                            checked: false,
                            description: `size="${size}", variant="${variant}", checkedIcon="${iconSet.checked}"`,
                            label: `${size.toUpperCase()} ${variant}`,
                            uniqueId: `toggle-${globalIndex++}`, // Unikatni ID
                        });
                    }
                } else {
                    // Both icons
                    for (let iconSet of icons.filter(
                        (i) => i.checked !== "" && i.unchecked !== ""
                    )) {
                        combinationsBySizeAndType[size][toggleType.type].push({
                            size,
                            variant,
                            checkedIcon: iconSet.checked,
                            uncheckedIcon: iconSet.unchecked,
                            checked: false,
                            description: `size="${size}", variant="${variant}", checkedIcon="${iconSet.checked}", uncheckedIcon="${iconSet.unchecked}"`,
                            label: `${size.toUpperCase()} ${variant}`,
                            uniqueId: `toggle-${globalIndex++}`, // Unikatni ID
                        });
                    }
                }
            }
        }
    }

    // Split into groups for better layout
    function chunkArray(array, size) {
        const chunks = [];
        for (let i = 0; i < array.length; i += size) {
            chunks.push(array.slice(i, i + size));
        }
        return chunks;
    }

    function handleToggleChange(description, newValue) {
        console.log(`Toggle changed: ${description} -> ${newValue}`);
    }

    // Generate unique IDs for each toggle
    let idCounter = 0;
    function generateId() {
        return `toggle-${++idCounter}`;
    }

    // Interactive toggle states - samo primary in secondary
    let primaryToggle = $state(false);
    let secondaryToggle = $state(false);

    // Objekt za shranjevanje state-ov vseh playground toggle-ov
    let toggleStates = $state({});

    // Funkcija za posodabljanje state-a
    function updateToggleState(uniqueId, newValue) {
        toggleStates[uniqueId] = newValue;
    }

    // Funkcija za pridobivanje trenutnega state-a
    function getToggleState(uniqueId) {
        return toggleStates[uniqueId] ?? false;
    }
</script>

<div class="card">
    <h1 class="text-3xl font-medium mb-8">
        Complete ToggleSwitch Component Testing
    </h1>
    <p class="opacity-70 mb-8">
        Testing all toggle combinations: No Icons, Checked Icon Only, and Both
        Icons - organized by size (LG → MD → SM). Click any toggle to test
        functionality.
    </p>

    {#each sizes as size}
        <div class="mb-20">
            <h2
                class="text-3xl font-medium mb-8 uppercase border-b-2 border-gray-300 pb-4"
            >
                {size} Size Toggles
            </h2>

            {#each toggleTypes as toggleType}
                <div class="mb-8">
                    <h3 class="text-xl mb-4 flex items-center gap-2">
                        <span
                            class="bg-blue/15 text-blue px-3 py-1 rounded-full text-sm font-medium"
                        >
                            {toggleType.label}
                        </span>
                        <span class="text-sm opacity-70">
                            ({combinationsBySizeAndType[size][toggleType.type]
                                .length} combinations)
                        </span>
                    </h3>

                    {#each chunkArray(combinationsBySizeAndType[size][toggleType.type], 5) as group}
                        <div class="mb-4">
                            <div
                                class="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4"
                            >
                                {#each group as test}
                                    {@const currentState = getToggleState(
                                        test.uniqueId
                                    )}
                                    <div
                                        class="flex flex-col items-center gap-3 p-4 bg-white shadow-button-white rounded-2xl"
                                    >
                                        <div
                                            class="flex flex-col items-center gap-2"
                                        >
                                            <span class="text-sm font-medium"
                                                >{test.label}</span
                                            >
                                            <ToggleSwitch
                                                id={test.uniqueId}
                                                size={test.size}
                                                variant={test.variant}
                                                checkedIcon={test.checkedIcon}
                                                uncheckedIcon={test.uncheckedIcon}
                                                checked={currentState}
                                                ariaLabel={test.description}
                                                onchange={(newValue) => {
                                                    updateToggleState(
                                                        test.uniqueId,
                                                        newValue
                                                    );
                                                    handleToggleChange(
                                                        test.description,
                                                        newValue
                                                    );
                                                }}
                                            />
                                            <span class="text-xs opacity-50">
                                                {currentState ? "ON" : "OFF"}
                                            </span>
                                        </div>
                                        <code
                                            class="text-xs text-black/60 bg-black/10 px-2 py-1 rounded-lg text-center leading-relaxed max-w-full break-all"
                                        >
                                            {test.description}
                                        </code>
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
    <div class="mb-12">
        <h2
            class="text-3xl font-medium mb-8 uppercase border-b-2 border-gray-300 pb-4"
        >
            Disabled States
        </h2>

        {#each sizes as size}
            <div class="mb-4">
                <h3 class="text-xl font-medium mb-6">
                    {size.toUpperCase()} - Disabled Examples
                </h3>

                <div
                    class="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4"
                >
                    {#each variants as variant}
                        <div
                            class="flex flex-col items-center gap-3 p-4 bg-white shadow-button-white rounded-2xl"
                        >
                            <div class="flex flex-col items-center gap-2">
                                <span class="text-sm font-medium"
                                    >{variant}</span
                                >
                                <ToggleSwitch
                                    id={generateId()}
                                    {size}
                                    {variant}
                                    checkedIcon="iconoir:check"
                                    disabled={true}
                                    checked={variant === "success" ||
                                        variant === "primary"}
                                    ariaLabel={`Disabled ${variant} toggle`}
                                />
                                <span class="text-xs opacity-50">DISABLED</span>
                            </div>
                            <code
                                class="text-xs text-black/60 bg-black/10 px-2 py-1 rounded-lg text-center leading-relaxed max-w-full break-all"
                            >
                                size="{size}", variant="{variant}",
                                disabled=true
                            </code>
                        </div>
                    {/each}
                </div>
            </div>
        {/each}
    </div>

    <!-- Interactive Testing Section -->
    <div class="mb-6 bg-blue/10 p-6 rounded-2xl">
        <h2 class="text-2xl font-medium text-blue mb-6">Interactive Testing</h2>
        <p class="opacity-70 mb-4">
            These toggles are bound to reactive variables. Toggle them and watch
            the state change!
        </p>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <!-- Primary Toggle -->
            <div class="bg-white p-4 rounded-xl">
                <h4 class="font-medium text-blue mb-3">Primary Toggle</h4>
                <div class="flex items-center justify-between">
                    <ToggleSwitch
                        id="interactive-primary"
                        size="md"
                        variant="primary"
                        checkedIcon="iconoir:check"
                        uncheckedIcon="iconoir:xmark"
                        bind:checked={primaryToggle}
                        ariaLabel="Interactive primary toggle"
                        onchange={(newValue) =>
                            console.log("Primary toggle:", newValue)}
                    />
                    <div class="text-right">
                        <div
                            class="text-sm font-medium {primaryToggle
                                ? 'text-green'
                                : 'text-red'}"
                        >
                            {primaryToggle ? "Enabled" : "Disabled"}
                        </div>
                        <div class="text-xs opacity-50">
                            State: {primaryToggle}
                        </div>
                    </div>
                </div>
            </div>

            <!-- Secondary Toggle -->
            <div class="bg-white p-4 rounded-xl">
                <h4 class="font-medium text-blue mb-3">Secondary Toggle</h4>
                <div class="flex items-center justify-between">
                    <ToggleSwitch
                        id="interactive-secondary"
                        size="md"
                        variant="secondary"
                        checkedIcon="iconoir:check"
                        uncheckedIcon="iconoir:xmark"
                        bind:checked={secondaryToggle}
                        ariaLabel="Interactive secondary toggle"
                        onchange={(newValue) =>
                            console.log("Secondary toggle:", newValue)}
                    />
                    <div class="text-right">
                        <div
                            class="text-sm font-medium {secondaryToggle
                                ? 'text-green'
                                : 'text-red'}"
                        >
                            {secondaryToggle ? "Enabled" : "Disabled"}
                        </div>
                        <div class="text-xs opacity-50">
                            State: {secondaryToggle}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- Summary -->
    <div class="bg-blue/10 p-6 rounded-2xl">
        <h3 class="text-lg font-medium text-blue mb-4">Test Summary</h3>
        <div class="grid md:grid-cols-2 gap-4">
            <div>
                <h4 class="font-medium text-black mb-2">Basic Properties:</h4>
                <ul class="space-y-1 text-sm opacity-70">
                    <li>
                        <strong>Sizes:</strong>
                        {sizes.join(", ")} ({sizes.length} variations)
                    </li>
                    <li>
                        <strong>Variants:</strong>
                        {variants.join(", ")} ({variants.length} variations)
                    </li>
                    <li>
                        <strong>Icon combinations:</strong>
                        {icons.length} different sets
                    </li>
                    <li>
                        <strong>States:</strong> enabled, disabled, checked, unchecked
                    </li>
                </ul>
            </div>
            <div>
                <h4 class="font-medium text-black mb-2">Toggle Types:</h4>
                <ul class="space-y-1 text-sm opacity-70">
                    {#each toggleTypes as toggleType}
                        <li>
                            <strong>{toggleType.label}:</strong>
                            {#each sizes as size}
                                {size.toUpperCase()}: {combinationsBySizeAndType[
                                    size
                                ][toggleType.type].length}{size !==
                                sizes[sizes.length - 1]
                                    ? ", "
                                    : ""}
                            {/each}
                        </li>
                    {/each}
                </ul>
            </div>
        </div>
        <div class="mt-4 pt-4 border-t border-black/10">
            <p class="font-medium">
                <strong>Total combinations tested:</strong>
                {Object.values(combinationsBySizeAndType)
                    .flatMap((sizeObj) => Object.values(sizeObj))
                    .flat().length} regular + disabled states + interactive examples
            </p>
        </div>
    </div>
</div>

<style>
    .card {
        max-width: 1200px;
        margin: 0 auto;
        padding: 2rem;
    }
</style>
