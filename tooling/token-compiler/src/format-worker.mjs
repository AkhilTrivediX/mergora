let input = "";
process.stdin.setEncoding("utf8");
for await (const chunk of process.stdin) {
  input += chunk;
}

try {
  const request = JSON.parse(input);
  const prettier = await import(request.prettierModule);
  const options = {
    arrowParens: "always",
    endOfLine: "lf",
    printWidth: 100,
    proseWrap: "preserve",
    semi: true,
    singleQuote: false,
    tabWidth: 2,
    trailingComma: "all",
    useTabs: false,
  };
  const results = await Promise.all(
    request.items.map((item) => prettier.format(item.content, { ...options, parser: item.parser })),
  );
  process.stdout.write(JSON.stringify(results));
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
