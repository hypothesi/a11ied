export const committedArtifactRegressionFixture = {
  versions: {
    "2.2": {
      criteriaCount: 86,
      coverageTotals: {
        criteria: 86,
        automated: 28,
        hybrid: 10,
        manual: 48,
        unknown: 0
      }
    },
    "2.1": {
      criteriaCount: 78,
      coverageTotals: {
        criteria: 78,
        automated: 28,
        hybrid: 6,
        manual: 44,
        unknown: 0
      }
    }
  },
  provenance: {
    rawSourceFiles: ["act-mapping.json", "axe-rules.json", "quickref-tags.yml", "wcag.2.1.json", "wcag.2.2.json"],
    criteria22SourceUrls: [
      "https://raw.githubusercontent.com/w3c/wai-wcag-quickref/main/_data/tags-sc.yml",
      "https://www.w3.org/WAI/WCAG22/wcag.json"
    ],
    coverage22SourceUrls: [
      "https://raw.githubusercontent.com/w3c/wai-wcag-quickref/main/_data/tags-sc.yml",
      "https://raw.githubusercontent.com/w3c/wcag/main/guidelines/act-mapping.json",
      "https://www.w3.org/WAI/WCAG22/wcag.json",
      "npm:axe-core"
    ]
  },
  representativeCriteria: {
    "1.3.1": {
      slug: "info-and-relationships",
      title: "Info and Relationships",
      level: "A",
      requiredTags: ["forms", "modals", "structure"],
      techniqueCount: 39,
      failureCount: 11
    },
    "2.4.3": {
      slug: "focus-order",
      title: "Focus Order",
      level: "A",
      requiredTags: ["focus", "keyboard", "modals"],
      techniqueCount: 0,
      failureCount: 2
    },
    "3.3.8": {
      slug: "accessible-authentication-minimum",
      title: "Accessible Authentication (Minimum)",
      level: "AA",
      requiredTags: ["forms", "logins"],
      techniqueCount: 0,
      failureCount: 1
    },
    "4.1.3": {
      slug: "status-messages",
      title: "Status Messages",
      level: "AA",
      requiredTags: ["forms", "messaging", "progress-steps"],
      techniqueCount: 12,
      failureCount: 2
    }
  }
} as const;
