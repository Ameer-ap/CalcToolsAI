const { DateTime } = require("luxon");

module.exports = function (eleventyConfig) {
  // Add passthrough copy for assets
  eleventyConfig.addPassthroughCopy("src/assets");

  // Add a custom date filter (for footer, posts, etc.)
  eleventyConfig.addFilter("date", function (dateObj, format = "yyyy") {
    return DateTime.fromJSDate(dateObj, { zone: "utc" }).toFormat(format);
  });

  // Set template formats
  eleventyConfig.setTemplateFormats(["md", "njk", "html"]);

  return {
    dir: {
      input: "src",        // Source files directory
      output: "_site",     // Build output directory
      includes: "_includes", // Includes directory (relative to input)
      data: "_data"        // Data directory (relative to input)
    },
    pathPrefix: "/CalcToolsAI/"  // 👈 important for GitHub Pages
  };
};
