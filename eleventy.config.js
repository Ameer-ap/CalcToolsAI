const { DateTime } = require("luxon");
const sitemap = require("@quasibit/eleventy-plugin-sitemap");

module.exports = function (eleventyConfig) {
  // Add passthrough copy for assets and robots.txt
  eleventyConfig.addPassthroughCopy("src/assets");
  eleventyConfig.addPassthroughCopy("src/robots.txt");

  // Add the sitemap plugin
  eleventyConfig.addPlugin(sitemap, {
    sitemap: {
      hostname: "https://calctoolsai.com",
    },
  });

  // Add a custom date filter (for footer, posts, etc.)
  eleventyConfig.addFilter("date", function (dateObj, format = "yyyy") {
    return DateTime.fromJSDate(dateObj, { zone: "utc" }).toFormat(format);
  });

  // Add a custom filter to build absolute URLs
  eleventyConfig.addFilter("absoluteUrl", function (path, base) {
    if (!path) return base;
    try {
      return new URL(path, base).toString();
    } catch (e) {
      return path; // fallback
    }
  });

  // Set template formats
  eleventyConfig.setTemplateFormats(["md", "njk", "html"]);

  return {
    dir: {
      input: "src", // Source files directory
      output: "_site", // Build output directory
      includes: "_includes", // Includes directory (relative to input)
      data: "_data" // Data directory (relative to input)
    },
    pathPrefix: "/", // Correct for custom domain
  };
};