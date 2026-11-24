# Samples

Each file is text the docs show in a code block. Pages import them with `?raw`.

Most files are real `a1` output, captured against the practice page at `/demo/team/`.
`PRACTICE_URL` stands for that page's address, and `withPracticeURL()` in
`src/lib/practice.ts` fills it in. A line holding only `...` marks output left out to
keep the block short.

To refresh an output sample, run the command the page shows above it and paste the
result here. The simulated screen reader prints three lines after each result,
`Keyboard focus`, `Reader cursor identity`, and `Target identity`. The samples leave
them out, and the screen reader guide says so.

`mcp-config.json.txt`, `github-workflow.yml.txt`, and the `*.ts.txt` files are examples
a reader copies. The test examples pass against the practice page. Run them again
after changing one.
