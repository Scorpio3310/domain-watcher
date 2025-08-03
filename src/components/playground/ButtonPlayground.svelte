<script>
    import Button from "$components/Button.svelte";

    // All possible prop combinations
    const sizes = ["lg", "md", "sm"];
    const colors = ["white", "black", "white-outline", "black-outline"];
    const icons = ["iconoir:search", "iconoir:plus"];
    const iconExampleClass = ["", "text-red", "text-lime"];

    // Button types to test
    const buttonTypes = [
        { type: "text-only", label: "Text Only" },
        { type: "text-with-icon", label: "Text + Icon" },
        { type: "icon-only", label: "Icon Only" },
    ];

    // Generate combinations organized by size and type
    let combinationsBySizeAndType = {};

    for (let size of sizes) {
        combinationsBySizeAndType[size] = {};

        for (let buttonType of buttonTypes) {
            combinationsBySizeAndType[size][buttonType.type] = [];

            for (let color of colors) {
                if (buttonType.type === "text-only") {
                    // Text only - no icons
                    combinationsBySizeAndType[size][buttonType.type].push({
                        size,
                        color,
                        icon: "",
                        iconClass: "",
                        text: `${size.toUpperCase()} ${color}`,
                        description: `size="${size}", color="${color}"`,
                    });
                } else {
                    // With icons
                    for (let icon of icons) {
                        for (let iconClass of iconExampleClass) {
                            combinationsBySizeAndType[size][
                                buttonType.type
                            ].push({
                                size,
                                color,
                                icon,
                                iconClass,
                                text:
                                    buttonType.type === "icon-only"
                                        ? ""
                                        : `${size.toUpperCase()} ${color}`,
                                description: `size="${size}", color="${color}", icon="${icon}"${iconClass ? `, iconClass="${iconClass}"` : ""}${buttonType.type === "icon-only" ? ` (icon only)` : ""}`,
                            });
                        }
                    }
                }
            }
        }
    }

    // Split into groups of 4 for better layout
    function chunkArray(array, size) {
        const chunks = [];
        for (let i = 0; i < array.length; i += size) {
            chunks.push(array.slice(i, i + size));
        }
        return chunks;
    }

    function handleClick(description) {
        console.log(`Clicked: ${description}`);
        alert(`Button clicked: ${description}`);
    }
</script>

<div class="card">
    <h1 class="text-3xl font-medium mb-8">Complete Button Component Testing</h1>
    <p class="opacity-70 mb-8">
        Testing all button combinations: Text Only, Text + Icon, and Icon Only -
        organized by size (LG → MD → SM).
    </p>

    {#each sizes as size}
        <div class="mb-20">
            <h2
                class="text-3xl font-medium mb-8 uppercase border-b-2 border-gray-300 pb-4"
            >
                {size} Size Buttons
            </h2>

            {#each buttonTypes as buttonType}
                <div class="mb-8">
                    <h3 class="text-xl mb-4 flex items-center gap-2">
                        <span
                            class="bg-blue/15 text-blue px-3 py-1 rounded-full text-sm font-medium"
                        >
                            {buttonType.label}
                        </span>
                        <span class="text-sm opacity-70">
                            ({combinationsBySizeAndType[size][buttonType.type]
                                .length} combinations)
                        </span>
                    </h3>

                    {#each chunkArray(combinationsBySizeAndType[size][buttonType.type], 4) as group, groupIndex}
                        <div class="mb-2">
                            <div
                                class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2"
                            >
                                {#each group as test}
                                    <div
                                        class="flex flex-col items-center gap-3 p-4 bg-white shadow-button-white rounded-2xl"
                                    >
                                        <div
                                            class="bg-neutral-300 px-4 py-3 rounded-2xl"
                                        >
                                            <Button
                                                size={test.size}
                                                color={test.color}
                                                text={test.text}
                                                icon={test.icon}
                                                iconClass={test.iconClass}
                                                onclick={() =>
                                                    handleClick(
                                                        test.description
                                                    )}
                                            />
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

    <!-- Disabled state examples by size and type -->
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

                {#each buttonTypes as buttonType}
                    <div class="mb-6">
                        <h4 class="text-lg font-medium opacity-70 mb-2">
                            {buttonType.label} - Disabled
                        </h4>
                        <div
                            class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2"
                        >
                            {#each colors as color}
                                <div
                                    class="flex flex-col items-center gap-3 p-4 bg-white shadow-button-white rounded-2xl"
                                >
                                    <div
                                        class="bg-neutral-300 px-4 py-3 rounded-2xl"
                                    >
                                        <Button
                                            {size}
                                            {color}
                                            text={buttonType.type ===
                                            "icon-only"
                                                ? ""
                                                : "Disabled"}
                                            icon={buttonType.type ===
                                            "text-only"
                                                ? ""
                                                : "iconoir:search"}
                                            disabled={true}
                                            onclick={() =>
                                                handleClick(
                                                    "This should not fire"
                                                )}
                                        />
                                    </div>
                                    <code
                                        class="text-xs text-black/60 bg-black/10 px-2 py-1 rounded-lg text-center leading-relaxed max-w-full break-all"
                                    >
                                        size="{size}", color="{color}",
                                        disabled=true ({buttonType.label.toLowerCase()})
                                    </code>
                                </div>
                            {/each}
                        </div>
                    </div>
                {/each}
            </div>
        {/each}
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
                        <strong>Colors:</strong>
                        {colors.join(", ")} ({colors.length} variations)
                    </li>
                    <li>
                        <strong>Icons:</strong>
                        {icons.join(", ")} ({icons.length} variations)
                    </li>
                    <li>
                        <strong>Icon colors:</strong>
                        {iconExampleClass.filter((c) => c).join(", ")} + default
                    </li>
                </ul>
            </div>
            <div>
                <h4 class="font-medium text-black mb-2">Button Types:</h4>
                <ul class="space-y-1 text-sm opacity-70">
                    {#each buttonTypes as buttonType}
                        <li>
                            <strong>{buttonType.label}:</strong>
                            {#each sizes as size}
                                {size.toUpperCase()}: {combinationsBySizeAndType[
                                    size
                                ][buttonType.type].length}{size !==
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
                    .flat().length} regular + disabled states
            </p>
        </div>
    </div>
</div>
