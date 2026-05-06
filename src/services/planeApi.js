const axios = require("axios");
const config = require("../config/config");
const FormData = require("form-data");
const logger = require("../utils/logger");

// Maximum file size (10MB)
const MAX_FILE_SIZE = 10 * 1024 * 1024;

// File type mappings
const FILE_ICONS = {
  // Document types
  pdf: "📄",
  doc: "📝",
  docx: "📝",
  xls: "📊",
  xlsx: "📊",
  ppt: "📊",
  pptx: "📊",
  txt: "📝",
  rtf: "📝",
  // Image types
  jpg: "🖼️",
  jpeg: "🖼️",
  png: "🖼️",
  gif: "🖼️",
  bmp: "🖼️",
  webp: "🖼️",
  // Archive types
  zip: "📦",
  rar: "📦",
  "7z": "📦",
  tar: "📦",
  gz: "📦",
  // Code types
  js: "📜",
  jsx: "📜",
  ts: "📜",
  tsx: "📜",
  py: "📜",
  java: "📜",
  cpp: "📜",
  cs: "📜",
  html: "📜",
  css: "📜",
  // Other types
  md: "📑",
  json: "📑",
  xml: "📑",
  yaml: "📑",
  yml: "📑",
};

const MIME_TYPES = {
  // Document types
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  txt: "text/plain",
  rtf: "application/rtf",
  // Image types
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  bmp: "image/bmp",
  webp: "image/webp",
  // Archive types
  zip: "application/zip",
  rar: "application/x-rar-compressed",
  "7z": "application/x-7z-compressed",
  tar: "application/x-tar",
  gz: "application/gzip",
  // Code types
  js: "text/javascript",
  jsx: "text/javascript",
  ts: "text/typescript",
  tsx: "text/typescript",
  py: "text/x-python",
  java: "text/x-java-source",
  cpp: "text/x-c++src",
  cs: "text/x-csharp",
  html: "text/html",
  css: "text/css",
  // Other types
  md: "text/markdown",
  json: "application/json",
  xml: "application/xml",
  yaml: "application/yaml",
  yml: "application/yaml",
};

/**
 * @typedef {Object} PlaneIssue
 * @property {string} id
 * @property {string} name
 * @property {string} description_html
 * @property {string} description_stripped
 * @property {string} priority
 * @property {string} state
 * @property {string[]} labels
 * @property {string} created_at
 * @property {string} updated_at
 * @property {number} sequence_id
 */

/**
 * @typedef {Object} PlaneAttachment
 * @property {string} id
 * @property {Object} attributes
 * @property {string} attributes.name
 * @property {number} attributes.size
 * @property {string} attributes.type
 */

/**
 * @typedef {Object} PlaneResponse
 * @property {number} total_count
 * @property {string} next_cursor
 * @property {string} prev_cursor
 * @property {boolean} next_page_results
 * @property {boolean} prev_page_results
 * @property {number} count
 * @property {number} total_pages
 * @property {number} total_results
 * @property {PlaneIssue[]} results
 */

/**
 * @typedef {Object} PlaneProject
 * @property {string} id
 * @property {string} identifier
 * @property {string} name
 */

const planeApi = axios.create({
  baseURL: "https://plane.pustakadata.id/api/v1",
  headers: {
    "X-API-Key": config.PLANE_API_KEY,
    "Content-Type": "application/json",
  },
});

class PlaneService {
  /**
   * Create a PlaneService instance for a specific workspace and project.
   * @param {string} workspaceSlug - The workspace slug
   * @param {string} projectId - The project ID
   */
  constructor(workspaceSlug, projectId) {
    if (!workspaceSlug || !projectId) {
      throw new Error("workspaceSlug and projectId are required");
    }

    this.workspaceSlug = workspaceSlug;
    this.projectId = projectId;

    // Maintain backward compatibility with existing code that uses this.config
    this.config = {
      WORKSPACE_SLUG: workspaceSlug,
      PROJECT_ID: projectId,
    };

    // Instance-specific caches
    this.statesCache = null;
    this.labelsCache = null;
    this.projectCache = null;
    this.projectMembersCache = null;

    logger.debug("PlaneService instance created", {
      workspace: workspaceSlug,
      project: projectId,
    });
  }

  async getStates() {
    if (this.statesCache) {
      logger.debug("Returning states from cache");
      return this.statesCache;
    }

    try {
      logger.debug("Fetching states from API");
      const response = await planeApi.get(
        `/workspaces/${this.workspaceSlug}/projects/${this.projectId}/states/`,
      );

      if (!response.data || !response.data.results) {
        logger.error("Invalid states response", { response: response.data });
        return {};
      }

      this.statesCache = response.data.results.reduce((acc, state) => {
        acc[state.id] = {
          name: state.name,
          color: state.color,
          group: state.group,
          sequence: state.sequence,
          description: state.description,
          is_default: state.default,
        };
        return acc;
      }, {});
      logger.debug("States cached successfully", {
        count: Object.keys(this.statesCache).length,
      });
      return this.statesCache;
    } catch (error) {
      logger.error("Error fetching states", error);
      return {};
    }
  }

  async getLabels() {
    if (this.labelsCache) {
      logger.debug("Returning labels from cache");
      return this.labelsCache;
    }

    try {
      logger.debug("Fetching labels from API");
      const response = await planeApi.get(
        `/workspaces/${this.workspaceSlug}/projects/${this.projectId}/labels`,
      );
      if (!response.data || !response.data.results) {
        logger.error("Invalid labels response", { response: response.data });
        return {};
      }
      this.labelsCache = response.data.results.reduce((acc, label) => {
        acc[label.id] = {
          name: label.name,
          color: label.color,
        };
        return acc;
      }, {});
      logger.debug("Labels cached successfully", {
        count: Object.keys(this.labelsCache).length,
      });
      return this.labelsCache;
    } catch (error) {
      logger.error("Error fetching labels", error);
      return {};
    }
  }

  /**
   * Get project details
   * @returns {Promise<PlaneProject>}
   */
  async getProjectDetails() {
    if (this.projectCache) {
      logger.debug("Returning project details from cache");
      return this.projectCache;
    }

    try {
      logger.debug("Fetching project details from API");
      const response = await planeApi.get(
        `/workspaces/${this.workspaceSlug}/projects/${this.projectId}/`,
      );
      this.projectCache = response.data;
      logger.debug("Project details cached successfully", {
        identifier: this.projectCache.identifier,
        name: this.projectCache.name,
      });
      return this.projectCache;
    } catch (error) {
      logger.error("Error fetching project details", error);
      throw error;
    }
  }

  async getProjectMembers() {
    if (this.projectMembersCache) {
      logger.debug("Returning project members from cache");
      return this.projectMembersCache;
    }

    const endpoints = [
      `/workspaces/${this.workspaceSlug}/projects/${this.projectId}/members/`,
      `/workspaces/${this.workspaceSlug}/projects/${this.projectId}/project-members/`,
      `/workspaces/${this.workspaceSlug}/projects/${this.projectId}/users/`,
    ];

    for (const endpoint of endpoints) {
      try {
        logger.debug("Fetching project members from API", { endpoint });
        const response = await planeApi.get(endpoint);
        const members = Array.isArray(response.data)
          ? response.data
          : Array.isArray(response.data?.results)
            ? response.data.results
            : Array.isArray(response.data?.members)
              ? response.data.members
              : [];

        if (members.length > 0) {
          this.projectMembersCache = members;
          logger.debug("Project members cached successfully", {
            count: this.projectMembersCache.length,
            endpoint,
          });
          return this.projectMembersCache;
        }
      } catch (error) {
        if (error.response?.status !== 404) {
          logger.warn("Error fetching project members", {
            endpoint,
            status: error.response?.status,
            message: error.message,
          });
        }
      }
    }

    logger.warn("No project members endpoint returned results", {
      workspace: this.workspaceSlug,
      project: this.projectId,
    });
    this.projectMembersCache = [];
    return this.projectMembersCache;
  }

  getMemberDisplayNames(member) {
    const names = [
      member?.name,
      member?.display_name,
      member?.displayName,
      member?.username,
      member?.user?.name,
      member?.user?.display_name,
      member?.user?.displayName,
      member?.user?.username,
      member?.user?.email,
      member?.email,
    ]
      .filter(Boolean)
      .map((value) => String(value).trim())
      .filter(Boolean);

    if (member?.user?.first_name || member?.user?.last_name) {
      names.push(
        [member.user.first_name, member.user.last_name]
          .filter(Boolean)
          .join(" ")
          .trim(),
      );
    }

    return [...new Set(names)];
  }

  getMemberId(member) {
    return member?.user?.id || member?.id || null;
  }

  getNormalizedProjectMembers(members) {
    return members
      .map((member) => {
        const id = this.getMemberId(member);
        if (!id) {
          return null;
        }

        const displayNames = this.getMemberDisplayNames(member);
        const primaryName =
          displayNames[0] || member?.username || member?.user?.username || id;
        const username = member?.username || member?.user?.username || "";
        const email = member?.email || member?.user?.email || "";

        return {
          id,
          name: primaryName,
          username,
          email,
          names: displayNames,
          raw: member,
        };
      })
      .filter(Boolean);
  }

  getNormalizedLabels(labelsObj) {
    // Accept either an object map (from getLabels) or an array
    if (!labelsObj) return [];
    if (Array.isArray(labelsObj)) {
      return labelsObj
        .map((label) => ({
          id: label.id,
          name: label.name || label.title || "",
        }))
        .filter((l) => l.id && l.name);
    }

    return Object.keys(labelsObj).map((id) => ({
      id,
      name: labelsObj[id].name,
    }));
  }

  async searchProjectLabels(query = "", excludedIds = [], limit = 25) {
    const labelsMap = await this.getLabels();
    const labels = this.getNormalizedLabels(labelsMap);
    const normalizedQuery = String(query || "")
      .trim()
      .toLowerCase();
    const excluded = new Set(excludedIds.map((v) => String(v)));

    return labels
      .filter((label) => !excluded.has(String(label.id)))
      .filter((label) => {
        if (!normalizedQuery) return true;
        return String(label.name || "")
          .toLowerCase()
          .includes(normalizedQuery);
      })
      .slice(0, limit);
  }

  async resolveLabelIdsWithLabels(labelInputs = []) {
    const inputs = labelInputs
      .map((v) => String(v || "").trim())
      .filter(Boolean);
    if (inputs.length === 0) return { labelIds: [], labels: [] };

    const labelsMap = await this.getLabels();
    const normalizedLabels = this.getNormalizedLabels(labelsMap);
    const labelById = new Map(normalizedLabels.map((l) => [String(l.id), l]));

    const resolved = [];
    const unresolved = [];

    for (const input of inputs) {
      if (
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          input,
        )
      ) {
        resolved.push(input);
        continue;
      }

      const match = normalizedLabels.find(
        (l) => String(l.name).toLowerCase() === input.toLowerCase(),
      );
      if (match) resolved.push(match.id);
      else unresolved.push(input);
    }

    if (unresolved.length > 0) {
      throw new Error(`Could not resolve label(s): ${unresolved.join(", ")}`);
    }

    const labelIds = [...new Set(resolved)];
    const labels = labelIds.map(
      (id) => labelById.get(String(id)) || { id, name: id },
    );
    return { labelIds, labels };
  }

  async searchProjectMembers(query = "", excludedIds = [], limit = 25) {
    const members = this.getNormalizedProjectMembers(
      await this.getProjectMembers(),
    );
    const normalizedQuery = query.trim().toLowerCase();
    const excluded = new Set(excludedIds.map((value) => String(value)));

    return members
      .filter((member) => !excluded.has(String(member.id)))
      .filter((member) => {
        if (!normalizedQuery) {
          return true;
        }

        const searchable = [
          member.name,
          member.username,
          member.email,
          ...member.names,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return searchable.includes(normalizedQuery);
      })
      .slice(0, limit);
  }

  async resolveProjectAssigneesWithMembers(assigneeInputs = []) {
    const inputs = assigneeInputs
      .map((value) => String(value || "").trim())
      .filter(Boolean);

    if (inputs.length === 0) {
      return { assigneeIds: [], members: [] };
    }

    const normalizedMembers = this.getNormalizedProjectMembers(
      await this.getProjectMembers(),
    );

    const memberById = new Map(
      normalizedMembers.map((member) => [String(member.id), member]),
    );

    const resolveInput = (input) => {
      const normalizedInput = input.toLowerCase();

      if (
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          input,
        )
      ) {
        return input;
      }

      const exactMatches = normalizedMembers.filter((member) =>
        member.names.some((name) => name.toLowerCase() === normalizedInput),
      );

      if (exactMatches.length === 1) {
        return exactMatches[0].id;
      }

      if (exactMatches.length > 1) {
        throw new Error(
          `Multiple Plane project members match "${input}". Use the assignee dropdown or Plane user UUID.`,
        );
      }

      return null;
    };

    const resolvedAssignees = [];
    const unresolvedInputs = [];

    for (const input of inputs) {
      const resolved = resolveInput(input);
      if (resolved) {
        resolvedAssignees.push(resolved);
      } else {
        unresolvedInputs.push(input);
      }
    }

    if (unresolvedInputs.length > 0) {
      const memberNames = normalizedMembers
        .slice(0, 10)
        .map((member) => member.username || member.email || member.name);

      throw new Error(
        `Could not resolve Plane assignee(s): ${unresolvedInputs.join(
          ", ",
        )}. Available project members include: ${
          memberNames.length > 0 ? memberNames.join(", ") : "none"
        }.`,
      );
    }

    const assigneeIds = [...new Set(resolvedAssignees)];
    const members = assigneeIds
      .map((id) => memberById.get(String(id)) || { id, name: id })
      .filter(Boolean);

    return { assigneeIds, members };
  }

  async resolveProjectAssignees(assigneeInputs = []) {
    const { assigneeIds } =
      await this.resolveProjectAssigneesWithMembers(assigneeInputs);
    return assigneeIds;
  }

  /**
   * Format issue ID with project identifier
   * @param {number} sequenceId
   * @returns {Promise<string>}
   */
  async formatIssueId(sequenceId) {
    const project = await this.getProjectDetails();
    return `${project.identifier}-${sequenceId}`;
  }

  /**
   * Format the issue data with additional details
   * @param {PlaneIssue} issue
   * @param {Object} states
   * @param {Object} labels
   * @returns {Object}
   */
  formatIssueData(issue, states, labels) {
    logger.debug("Formatting issue data", { issueId: issue.id });
    const stateId =
      typeof issue.state === "object" ? issue.state?.id : issue.state;
    return {
      ...issue,
      state_detail:
        states[stateId] ||
        (typeof issue.state === "object"
          ? issue.state
          : {
              name: "Unknown",
              group: "Unknown",
            }),
      label_details: issue.labels
        .map((id) => labels[id])
        .filter((label) => label),
      description: issue.description_stripped || issue.description_html || "",
    };
  }

  async getAllIssues(filters = {}) {
    try {
      logger.info("Fetching all issues", { filters });
      const [states, labels, project] = await Promise.all([
        this.getStates(),
        this.getLabels(),
        this.getProjectDetails(),
      ]);

      const queryParams = new URLSearchParams({
        per_page: "100", // Maximum allowed
        order_by: "-created_at",
      });

      const response = await planeApi.get(
        `/workspaces/${this.workspaceSlug}/projects/${this.projectId}/issues/?${queryParams.toString()}`,
      );

      if (!response.data || !Array.isArray(response.data.results)) {
        logger.warn("No issues found or invalid response", {
          response: response.data,
        });
        return [];
      }

      const enhancedResults = response.data.results.map((issue) => ({
        ...this.formatIssueData(issue, states, labels, project),
        formatted_id: `${project.identifier}-${issue.sequence_id}`,
      }));

      const normalizedFilters = {
        state: filters.state ? String(filters.state).toLowerCase() : "",
        priority: filters.priority
          ? String(filters.priority).toLowerCase()
          : "",
        assigneeIds: Array.isArray(filters.assigneeIds)
          ? filters.assigneeIds.map((value) => String(value))
          : [],
      };

      const filteredResults = enhancedResults.filter((issue) => {
        if (
          normalizedFilters.state &&
          String(
            issue.state_detail?.group || issue.state_detail?.name || "",
          ).toLowerCase() !== normalizedFilters.state
        ) {
          return false;
        }

        if (
          normalizedFilters.priority &&
          String(issue.priority || "").toLowerCase() !==
            normalizedFilters.priority
        ) {
          return false;
        }

        if (normalizedFilters.assigneeIds.length > 0) {
          const issueAssigneeIds = Array.isArray(issue.assignees)
            ? issue.assignees
                .map((assignee) =>
                  typeof assignee === "string"
                    ? assignee
                    : assignee?.id ||
                      assignee?.user_id ||
                      assignee?.userId ||
                      null,
                )
                .filter(Boolean)
                .map((value) => String(value))
            : [];

          if (
            !normalizedFilters.assigneeIds.some((assigneeId) =>
              issueAssigneeIds.includes(String(assigneeId)),
            )
          ) {
            return false;
          }
        }

        return true;
      });

      logger.info("Issues fetched successfully", {
        count: filteredResults.length,
      });
      return {
        ...response.data,
        count: filteredResults.length,
        results: filteredResults,
      };
    } catch (error) {
      logger.error("Error fetching all issues", error);
      return [];
    }
  }

  async createIssue(
    title,
    description,
    priority,
    assignees = [],
    labels = [],
    start_date = null,
    target_date = null,
  ) {
    try {
      logger.info("Creating new issue", {
        title,
        priority,
        assignees: assignees.length > 0 ? assignees : "Not provided",
      });

      const payload = {
        name: title,
        description_html: `<p class="editor-paragraph-block">${description}</p>`,
        priority,
      };

      if (assignees.length > 0) {
        payload.assignees = assignees;
      }
      if (labels && labels.length > 0) {
        payload.labels = labels;
      }
      if (start_date) payload.start_date = start_date;
      if (target_date) payload.target_date = target_date;

      const response = await planeApi.post(
        `/workspaces/${this.workspaceSlug}/projects/${this.projectId}/issues/`,
        payload,
      );
      logger.info("Issue created successfully", {
        issueId: response.data.id,
        sequenceId: response.data.sequence_id,
      });
      return response.data;
    } catch (error) {
      logger.error("Error creating issue", error);
      throw error;
    }
  }

  /**
   * Get a single issue by ID
   * @param {string} issueId
   * @returns {Promise<Object>}
   */
  async getIssueById(issueId) {
    try {
      logger.debug("Fetching issue by ID", { issueId });
      const [issue, states, labels, attachments, project] = await Promise.all([
        planeApi.get(
          `/workspaces/${this.workspaceSlug}/projects/${this.projectId}/issues/${issueId}/`,
        ),
        this.getStates(),
        this.getLabels(),
        this.getIssueAttachments(issueId),
        this.getProjectDetails(),
      ]);

      const formattedIssue = {
        ...this.formatIssueData(issue.data, states, labels),
        attachments: attachments,
        formatted_id: `${project.identifier}-${issue.data.sequence_id}`,
      };
      logger.debug("Issue fetched successfully", {
        issueId,
        hasAttachments: attachments.length > 0,
      });
      return formattedIssue;
    } catch (error) {
      logger.error("Error fetching issue by ID", error);
      throw error;
    }
  }

  /**
   * Get issue attachments
   * @param {string} issueId
   * @returns {Promise<PlaneAttachment[]>}
   */
  async getIssueAttachments(issueId) {
    try {
      logger.debug("Fetching issue attachments", { issueId });
      const response = await planeApi.get(
        `/workspaces/${this.workspaceSlug}/projects/${this.projectId}/issues/${issueId}/issue-attachments/`,
      );

      const attachments = Array.isArray(response.data) ? response.data : [];
      logger.debug("Attachments fetched successfully", {
        issueId,
        count: attachments.length,
      });
      return attachments;
    } catch (error) {
      logger.error("Error fetching attachments", error);
      return [];
    }
  }

  /**
   * Get issue by sequence ID
   * @param {string} sequenceId
   * @returns {Promise<Object>}
   */
  async getIssueBySequenceId(sequenceId) {
    try {
      logger.info("Fetching issue by sequence ID", { sequenceId });
      const [issue, states, labels, project] = await Promise.all([
        planeApi.get(`/workspaces/${this.workspaceSlug}/issues/${sequenceId}/`),
        this.getStates(),
        this.getLabels(),
        this.getProjectDetails(),
      ]);
      const attachments = await this.getIssueAttachments(issue.data.id);
      const formattedIssue = {
        ...this.formatIssueData(issue.data, states, labels),
        attachments: attachments,
        formatted_id: `${project.identifier}-${issue.data.sequence_id}`,
      };
      logger.info("Issue fetched successfully", {
        sequenceId,
        issueId: issue.data.id,
        hasAttachments: attachments.length > 0,
      });
      return formattedIssue;
    } catch (error) {
      logger.error("Error fetching issue by sequence ID", error);
      throw error;
    }
  }

  // File utility methods
  getFileIcon(filename) {
    const ext = filename.split(".").pop().toLowerCase();
    return FILE_ICONS[ext] || "📎";
  }

  getContentType(filename) {
    const ext = filename.split(".").pop().toLowerCase();
    return MIME_TYPES[ext] || "application/octet-stream";
  }

  formatFileSize(bytes) {
    const units = ["B", "KB", "MB", "GB"];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }

  validateFileSize(size) {
    if (size > MAX_FILE_SIZE) {
      const error = new Error(
        `File size (${this.formatFileSize(
          size,
        )}) exceeds maximum allowed size of ${this.formatFileSize(
          MAX_FILE_SIZE,
        )}`,
      );
      logger.error("File size validation failed", {
        size,
        maxSize: MAX_FILE_SIZE,
        formattedSize: this.formatFileSize(size),
        formattedMaxSize: this.formatFileSize(MAX_FILE_SIZE),
      });
      throw error;
    }
    return true;
  }

  /**
   * Upload a file to an issue using Plane's three-step upload process
   * @param {string} issueId
   * @param {Buffer} fileBuffer
   * @param {string} fileName
   * @param {string} contentType
   * @returns {Promise<PlaneAttachment>}
   */
  async uploadFileToIssue(issueId, fileBuffer, fileName, contentType) {
    try {
      logger.info("Starting file upload process", {
        issueId,
        fileName,
        contentType,
        fileSize: fileBuffer.length,
      });

      // Input validation
      if (!fileBuffer || !Buffer.isBuffer(fileBuffer)) {
        throw new Error("Invalid file buffer provided");
      }
      if (!fileName || typeof fileName !== "string") {
        throw new Error("Invalid file name provided");
      }
      if (!contentType || typeof contentType !== "string") {
        throw new Error("Invalid content type provided");
      }

      this.validateFileSize(fileBuffer.length);

      // Step 1: Get upload credentials
      logger.debug("Getting upload credentials");
      let uploadCredentialsResponse;
      try {
        // Create a direct axios request to match curl command
        uploadCredentialsResponse = await axios({
          method: "post",
          url: `https://plane.pustakadata.id/api/v1/workspaces/${this.workspaceSlug}/projects/${this.projectId}/issues/${issueId}/issue-attachments/`,
          headers: {
            "Content-Type": "application/json",
            "x-api-key": config.PLANE_API_KEY,
          },
          data: {
            name: fileName,
            size: fileBuffer.length,
            type: contentType,
          },
        });
      } catch (error) {
        logger.error("Upload credentials error", error);
        if (error.response?.status === 404) {
          throw new Error("Issue not found");
        }
        if (error.response?.status === 413) {
          throw new Error("File size too large");
        }
        throw new Error(
          "Failed to get upload credentials: " +
            (error.response?.data?.error || error.message),
        );
      }

      const { upload_data, asset_id } = uploadCredentialsResponse.data;
      if (!upload_data || !asset_id) {
        throw new Error("Invalid upload credentials received from server");
      }

      // Step 2: Upload file to S3
      logger.debug("Uploading file to storage", {
        uploadUrl: upload_data.url,
        assetId: asset_id,
      });
      const formData = new FormData();
      // Add required S3 fields in specific order
      formData.append("Content-Type", contentType);
      formData.append("key", upload_data.fields.key);
      formData.append("x-amz-algorithm", upload_data.fields["x-amz-algorithm"]);
      formData.append(
        "x-amz-credential",
        upload_data.fields["x-amz-credential"],
      );
      formData.append("x-amz-date", upload_data.fields["x-amz-date"]);
      formData.append("policy", upload_data.fields.policy);
      formData.append("x-amz-signature", upload_data.fields["x-amz-signature"]);
      // File must be the last field
      formData.append("file", fileBuffer, {
        filename: fileName,
        contentType: contentType,
      });

      try {
        await axios.post(upload_data.url, formData, {
          headers: {
            ...formData.getHeaders(),
            "Content-Type": "multipart/form-data",
          },
        });
      } catch (error) {
        logger.error("Storage upload error", error);
        throw new Error(
          "Failed to upload file to storage: " +
            (error.response?.data?.error || error.message),
        );
      }

      // Step 3: Complete the upload
      logger.debug("Completing upload process", { asset_id });
      try {
        const completeResponse = await axios({
          method: "patch",
          url: `https://plane.pustakadata.id/api/v1/workspaces/${this.workspaceSlug}/projects/${this.projectId}/issues/${issueId}/issue-attachments/${asset_id}`,
          headers: {
            "Content-Type": "application/json",
            "x-api-key": config.PLANE_API_KEY,
          },
        });
        logger.info("File upload completed successfully", {
          issueId,
          fileName,
          asset_id,
        });
        return completeResponse.data;
      } catch (error) {
        logger.error("Complete upload error", error);
        throw new Error(
          "Failed to complete upload: " +
            (error.response?.data?.error || error.message),
        );
      }
    } catch (error) {
      logger.error("File upload failed", error);
      throw error;
    }
  }
}

// Export the class itself (not an instance) to support multiple instances
module.exports = PlaneService;
