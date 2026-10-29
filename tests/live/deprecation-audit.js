// Deprecation audit (Plan 8). Run as GM right after a reload, with the live scripts served from /bna-live/.
// Runs the live checks while deprecated calls through build-n-action throw, and reports every console warning
// or error that mentions the module. Restores CONFIG.compatibility and the console.
(async () => {
  const saved = { ...CONFIG.compatibility };
  const seen = [];
  const watch = level => {
    const original = console[level];
    console[level] = (...args) => {
      const text = args.map(arg => ((arg instanceof Error) ? `${arg.message}\n${arg.stack}` : String(arg))).join(" ");
      if (/build-n-action/i.test(text)) seen.push({ level, text: text.slice(0, 800) });
      original.apply(console, args);
    };
    return () => {
      console[level] = original;
    };
  };
  const restore = [watch("warn"), watch("error")];
  const fetchScript = async file => (await fetch(`/bna-live/${file}?${Date.now()}`)).text();
  const run = async file => {
    const report = await eval(await fetchScript(file));
    if (!Array.isArray(report)) return "ran";
    const failed = report.filter(entry => !entry.pass).map(entry => entry.name);
    return `${report.length - failed.length}/${report.length}${failed.length ? ` (failed: ${failed.join("; ")})` : ""}`;
  };
  const results = {};
  try {
    CONFIG.compatibility.mode = CONST.COMPATIBILITY_MODES.FAILURE;
    CONFIG.compatibility.includePatterns = [/build-n-action/];
    // The editor check first: it expects the editor chunk not to be loaded yet.
    for (const file of ["editor-check.js", "preroll-check.js", "surfaces-check.js", "migration-check.js"]) results[file] = await run(file);
    await eval(await fetchScript("reactions-shared.js"));
    results["reactions-midi.js"] = await run("reactions-midi.js");
  } finally {
    Object.assign(CONFIG.compatibility, saved);
    for (const undo of restore) undo();
  }
  return { results, deprecations: seen };
})();
