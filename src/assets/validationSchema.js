const validationSchema = {
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "media": {
      "type": ["string", "object"],
      "if": {
        "type": "object"
      },
      "then": {
        "type": "object",
        "required": ["input", "output"],
        "properties": {
          "input": {
            "type": "string",
            "pattern": "^[^/].*[^/]$|^$",
            "errorMessage": "Property 'input' must be a valid relative path (no leading or trailing slash)."
          },
          "output": {
            "type": "string",
            "pattern": "^/?[^/].*[^/]$|^/?$",
            "errorMessage": "Property 'output' must be a valid path with no trailing slash."
          },
          "path": {
            "type": "string",
            "pattern": "^[^/].*[^/]$|^$",
            "errorMessage": "Property 'path' must be a valid relative path (no leading or trailing slash)."
          },
          "extensions": {
            "type": "array",
            "items": {
              "type": "string"
            },
            "errorMessage": "Property 'extensions' must be an array of strings (e.g. [ png, gif ])."
          },
          "categories": {
            "type": "array",
            "items": {
              "type": "string",
              "enum": ["image", "document", "video", "audio", "compressed"],
              "errorMessage": "Invalid category value. Allowed values are: image, document, video, audio, compressed."
            },
            "errorMessage": "Property 'categories' must be an array of predefined category strings."
          }
        },
        "additionalProperties": false,
        "errorMessage": {
          "required": {
            "input": "Property 'input' is required when 'media' is an object.",
            "output": "Property 'output' is required when 'media' is an object."
          }
        }
      },
      "else": {
        "type": "string",
        "pattern": "^[^/].*[^/]$|^$",
        "errorMessage": "If 'media' is a string, it must be a valid relative path (no leading or trailing slash)."
      },
      "errorMessage": {
        "type": "'media' must be a string (relative path) or an object with 'input' and 'output' attributes."
      }
    },
    "content": {
      "type": "array",
      "items": {
        "$ref": "#/definitions/contentObject"
      },
      "minItems": 1,
      "errorMessage": "Property 'content' must be an array of objects with at least one entry."
    },
    "settings": {
      "type": ["boolean", "null"],
      "enum": [false, null],
      "errorMessage": "Property 'settings' can only be false or null."
    }
  },
  "additionalProperties": false,
  "definitions": {
    "contentObject": {
      "type": "object",
      "properties": {
        "name": {
          "type": "string",
          "pattern": "^[a-zA-Z0-9-_]+$",
          "errorMessage": "Property 'name' must be alphanumeric with dashes and underscores."
        },
        "label": {
          "type": "string",
          "errorMessage": "Property 'label' must be a string."
        },
        "description": {
          "type": ["string", "null"],
          "errorMessage": "Property 'description' must be a string if specified."
        },
        "type": {
          "type": "string",
          "enum": ["collection", "file"],
          "errorMessage": "Property 'type' must be either 'collection' or 'file'."
        },
        "path": {
          "type": "string",
          "pattern": "^[^/].*[^/]$|^$",
          "errorMessage": "Property 'path' must be a valid relative path (no leading or trailing slash)."
        },
        "filename": {
          "type": ["string", "null"],
          "errorMessage": "Property 'filename' must be a string if specified."
        },
        "list": {
          "type": ["object", "boolean"],
          "if": {
            "type": "object"
          },
          "then": {
            "type": "object",
            "properties": {
              "min": {
                "type": "integer",
                "minimum": 0,
                "errorMessage": "Property 'min' must be a positive integer (minimum 0)."
              },
              "max": {
                "type": "integer",
                "minimum": 1,
                "errorMessage": "Property 'max' must be a positive integer (minimum 1)."
              }
            },
            "additionalProperties": false
          },
          "else": {
            "type": "boolean",
            "errorMessage": "Property 'list' can be a boolean; 'true' for an array of values, 'false' for a single value."
          },
          "errorMessage": {
            "type": "Property 'list' must be either a boolean or an object with 'min' and 'max' properties."
          }
        },
        "view": {
          "type": ["object", "null"],
          "properties": {
            "fields": {
              "type": "array",
              "items": {
                "type": "string"
              },
              "errorMessage": "Property 'fields' must be an array of strings if specified."
            },
            "primary": {
              "type": ["string", "null"],
              "errorMessage": "Property 'primary' must be a string if specified."
            },
            "sort": {
              "type": "array",
              "items": {
                "type": "string"
              },
              "errorMessage": "Property 'sort' must be an array of strings if specified."
            },
            "search": {
              "type": "array",
              "items": {
                "type": "string"
              },
              "errorMessage": "Property 'search' must be an array of strings if specified."
            },
            "default": {
              "type": ["object", "null"],
              "properties": {
                "search": {
                  "type": ["string", "null"],
                  "errorMessage": "Property 'default.search' must be a string if specified."
                },
                "sort": {
                  "type": ["string", "null"],
                  "errorMessage": "Property 'default.sort' must be a string if specified."
                },
                "order": {
                  "type": ["string", "null"],
                  "enum": ["asc", "desc"],
                  "errorMessage": "Property 'default.order' must be 'asc' or 'desc' if specified."
                }
              },
              "additionalProperties": false
            }
          },
          "additionalProperties": false
        },
        "format": {
          "type": ["string", "null"],
          "enum": ["yaml-frontmatter", "json-frontmatter", "toml-frontmatter", "yaml", "json", "toml", "datagrid", "code", "raw"],
          "errorMessage": "Property 'format' must be one of the specified formats: yaml-frontmatter, json-frontmatter, toml-frontmatter, yaml, json, toml, datagrid, code, raw."
        },
        "delimiters": {
          "type": ["string", "array"],
          "if": {
            "type": "array"
          },
          "then": {
            "type": "array",
            "items": {
              "type": "string"
            },
            "minItems": 2,
            "maxItems": 2,
            "errorMessage": "If specified as an array, 'delimiters' must contain exactly two string values."
          },
          "else": {
            "type": "string",
            "errorMessage": "If specified as a string, 'delimiters' must be a single string value."
          },
          "errorMessage": {
            "type": "Property 'delimiters' must be either a string or an array of 2 strings."
          }
        },        
        "subfolders": {
          "type": ["boolean", "null"],
          "errorMessage": "Property 'subfolders' must be a boolean value if specified."
        },
        "fields": {
          "type": "array",
          "items": {
            "$ref": "#/definitions/fieldObject"
          },
          "minItems": 1,
          "errorMessage": "Property 'fields' must be an array of field objects with at least one element."
        }
      },
      "required": ["name", "type", "path"],
      "additionalProperties": false,
      "errorMessage": {
        "required": {
          "name": "Property 'name' is required.",
          "type": "Property 'type' is required.",
          "path": "Property 'path' is required.",
        },
        "type": "Each content entry must be an object with 'name', 'label', 'type', 'path' and 'fields' attributes."
      }
    },
    "fieldObject": {
      "type": "object",
      "properties": {
        "name": {
          "type": "string",
          "pattern": "^[a-zA-Z0-9-_]+$",
          "errorMessage": "Property 'name' must be alphanumeric with dashes and underscores."
        },
        "label": {
          "type": ["string", "boolean"],
          "if": {
            "type": "string"
          },
          "then": {
            "type": "string",
            "errorMessage": "Property 'label' should be a string to display a label above the field."
          },
          "else": {
            "type": "boolean",
            "enum": [false],
            "errorMessage": "If not a string, property 'label' can only be 'false' to indicate absence of label."
          },
          "errorMessage": {
            "type": "Property 'label' can be either `false` or a string."
          }
        },
        "description": {
          "type": ["string", "null"],
          "errorMessage": "Property 'description' must be a string if specified."
        },
        "type": {
          "type": "string",
          "enum": ["boolean", "code", "date", "image", "number", "object", "rich-text", "select", "string", "text"],
          "errorMessage": "Property 'type' must be one of the valid field types (see documentation)."
        },
        "default": {
          "type": ["null", "boolean", "number", "string", "object", "array"],
          "errorMessage": "Property 'default' must match the specified field type."
        },
        "list": {
          "type": ["object", "boolean"],
          "if": {
            "type": "object"
          },
          "then": {
            "type": "object",
            "properties": {
              "min": {
                "type": "integer",
                "minimum": 0,
                "errorMessage": "Property 'min' must be a positive integer (minimum 0)."
              },
              "max": {
                "type": "integer",
                "minimum": 1,
                "errorMessage": "Property 'max' must be a positive integer (minimum 1)."
              }
            },
            "additionalProperties": false
          },
          "else": {
            "type": "boolean",
            "errorMessage": "Property 'list' can be a boolean; 'true' for an array of values, 'false' for a single value."
          },
          "errorMessage": {
            "type": "Property 'list' must be either a boolean or an object with 'min' and 'max' properties."
          }
        },
        "hidden": {
          "type": ["boolean", "null"],
          "errorMessage": "Property 'hidden' must be a boolean value if specified."
        },
        "required": {
          "type": ["boolean", "null"],
          "errorMessage": "Property 'required' must be a boolean value if specified."
        },
        "pattern": {
          "type": ["object", "string"],
          "if": {
            "type": "object"
          },
          "then": {
            "type": "object",
            "properties": {
              "regex": {
                "type": "string",
                "errorMessage": "Property 'regex' must be a valid regex."
              },
              "message": {
                "type": "string",
                "errorMessage": "Property 'message' must be a string explaining the regex pattern."
              }
            },
            "required": ["regex"],
            "additionalProperties": false,
            "errorMessage": {
              "required": {
                "regex": "Property 'regex' is required when 'pattern' is an object."
              }
            }
          },
          "else": {
            "type": "string",
            "errorMessage": "Property 'pattern' must be a valid regex string if specified."
          },
          "errorMessage": {
            "type": "Property 'pattern' must be a string (regex) or an object with a 'regex' and an optional 'message' properties."
          }
        },
        "options": {
          "type": ["object", "null"],
          "errorMessage": "Property 'options' must be an object if specified."
        },
        "fields": {
          "type": "array",
          "items": {
            "$ref": "#/definitions/fieldObject"
          },
          "minItems": 1,
          "errorMessage": "Property 'fields' must be an array of nested field objects if specified."
        }
      },
      "required": ["name", "type"],
      "additionalProperties": false,
      "errorMessage": {
        "required": {
          "name": "Property 'name' is required for each field.",
          "type": "Property 'type' is required for each field."
        }
      }
    }
  }
};

export default validationSchema;