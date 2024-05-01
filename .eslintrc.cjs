module.exports = {
    "env": {
        "browser": true,
        "es2021": true
    },
    "extends": [
        // "eslint:recommended",
        // "plugin:@typescript-eslint/recommended"
        // "plugin:xss/recommended"
    ],
    "overrides": [
        {
            "env": {
                "node": true
            },
            "files": [
                ".eslintrc.{js,cjs}"
            ],
            "parserOptions": {
                "sourceType": "script"
            }
        }
    ],
    "parser": "@typescript-eslint/parser",
    "parserOptions": {
        "ecmaVersion": "latest",
        "sourceType": "module"
    },
    "plugins": [
        "@typescript-eslint",
        "import",
        "no-secrets",
        "xss",
        "no-unsanitized",
        "promise",
    ],
    "rules": {
        "import/extensions": [
            "error",
            "ignorePackages",
            {
                "js": "always",
            }
        ],
        "prefer-const": ["error", {
            "destructuring": "any",
            "ignoreReadBeforeAssign": false
        }],

        // SECURTIY ----
        // XSS
        // https://github.com/Rantanen/eslint-plugin-xss/blob/master/docs/rules/no-location-href-assign.md
        "xss/no-location-href-assign": 2,
        // "xss/no-mixed-html": [2, {
        //     "htmlVariableRules": ["AsHtml", "HtmlEncoded/i", "^html$"],
        // }],

        // SECRETS
        "no-secrets/no-secrets": ["error", {
            "tolerance": 4.5,
            "ignoreContent": "^ABCD.+|^data:image/"
        }],

        // HTML SANITIZATION
        // "no-unsanitized/method": "error",
        // "no-unsanitized/property": "warn",


        // STYLES ----
        "block-spacing": "error",
        // "brace-style": ["erronr", "stroustrup", { "allowSingleLine": true }],

        // CODE QUALITY ----

        // https://github.com/eslint-community/eslint-plugin-promise?tab=readme-ov-file
        // "promise/always-return": "error",
        "promise/no-return-wrap": "error",
        // "promise/param-names": "warn", // proper resolve and reject names
        // "promise/catch-or-return": "error",
        "promise/no-native": "off",
        // "promise/no-nesting": "warn",
        // "promise/no-promise-in-callback": "warn",
        // "promise/no-callback-in-promise": "warn",
        // "promise/avoid-new": "warn",
        "promise/no-new-statics": "error",
        "promise/no-return-in-finally": "warn",
        "promise/valid-params": "warn",
    }
}
