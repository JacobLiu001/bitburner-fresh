// Generated helpfully by ChatGPT :D
const fs = require("fs");
const path = require("path");
const ts = require("typescript");

/**
 * Generate a global.d.ts file that re-exports all named type exports
 * from the specified module into the global namespace. This version
 * also includes enums (both type and value).
 */
function generateGlobalTypes(
    inputFile,
    outputFile,
    globalNamespaceComment = "Auto-generated global types."
) {
    // Create a program to analyze the input file
    const program = ts.createProgram([inputFile], {
        // Use the same compiler options you'd have in your tsconfig
        target: ts.ScriptTarget.ESNext,
        module: ts.ModuleKind.ESNext,
        skipLibCheck: true,
        // etc...
    });

    // Source file AST
    const sourceFile = program.getSourceFile(inputFile);
    if (!sourceFile) {
        throw new Error(`Could not find or open file: ${inputFile}`);
    }

    // TypeChecker gives us symbol-level info
    const checker = program.getTypeChecker();

    // Get the symbol representing the file itself
    const sourceSymbol = checker.getSymbolAtLocation(sourceFile);
    if (!sourceSymbol) {
        throw new Error(`Could not get symbol for file: ${inputFile}`);
    }

    // Gather all exported symbols
    const exportedSymbols = checker.getExportsOfModule(sourceSymbol);

    // We want to handle type aliases, interfaces, and enums. 
    // (You could also include classes if desired.)
    const relevantSymbols = exportedSymbols.filter((symbol) => {
        const declarations = symbol.getDeclarations() ?? [];
        return declarations.some((decl) => {
            switch (decl.kind) {
                case ts.SyntaxKind.TypeAliasDeclaration:
                case ts.SyntaxKind.InterfaceDeclaration:
                case ts.SyntaxKind.EnumDeclaration:
                    return true;
                default:
                    return false;
            }
        });
    });

    // Generate lines for the global.d.ts file
    const lines = [];
    lines.push("// " + globalNamespaceComment);
    lines.push("declare global {");
    lines.push(`  // Re-exports from ${path.basename(inputFile)}`);

    // The relative path we’ll use inside `import("...")`
    const relativeImportPath = "./" + path.basename(inputFile, ".ts");

    relevantSymbols.forEach((symbol) => {
        const name = symbol.getName();
        // Check the declaration kind(s) to figure out how to emit
        const declarations = symbol.getDeclarations() ?? [];

        // If *any* declaration is an enum, we treat it as an enum
        const isEnum = declarations.some(
            (d) => d.kind === ts.SyntaxKind.EnumDeclaration
        );

        if (isEnum) {
            // Enums are both a value and a type in TS
            lines.push(`  const ${name}: typeof import("${relativeImportPath}").${name};`);
            lines.push(`  type ${name} = import("${relativeImportPath}").${name};`);
        } else {
            // Otherwise, for type aliases and interfaces, a type-only alias is enough
            lines.push(`  type ${name} = import("${relativeImportPath}").${name};`);
        }
    });

    lines.push("}");
    lines.push("");
    // Force the file to be a module
    lines.push("export { };");

    const result = lines.join("\n");
    fs.writeFileSync(outputFile, result, "utf-8");
    console.log(`Generated global declarations at: ${outputFile}`);
}

// Adjust these paths as needed for your setup
const INPUT_FILE = "NetscriptDefinitions.d.ts";
const OUTPUT_FILE = "global_dump.d.ts";

generateGlobalTypes(INPUT_FILE, OUTPUT_FILE);
