# Salesforce CLI Reference Documentation

> **Generated:** 2025-12-28T14:14:46.700Z
> **CLI Version:** @salesforce/cli/2.116.6 linux-x64 node-v22.15.1
> **Total Commands:** 206
> **Command Topics:** 34

---

## Table of Contents

- [agent](#agent) (15 commands)
- [alias](#alias) (3 commands)
- [analytics](#analytics) (1 commands)
- [apex](#apex) (8 commands)
- [api](#api) (2 commands)
- [autocomplete](#autocomplete) (1 commands)
- [cmdt](#cmdt) (5 commands)
- [code-analyzer](#code-analyzer) (3 commands)
- [commands](#commands) (1 commands)
- [community](#community) (3 commands)
- [config](#config) (4 commands)
- [data](#data) (21 commands)
- [dev](#dev) (6 commands)
- [doctor](#doctor) (1 commands)
- [flow](#flow) (2 commands)
- [force](#force) (7 commands)
- [help](#help) (1 commands)
- [info](#info) (1 commands)
- [lightning](#lightning) (5 commands)
- [logic](#logic) (2 commands)
- [org](#org) (36 commands)
- [package](#package) (25 commands)
- [package1](#package1) (4 commands)
- [plugins](#plugins) (12 commands)
- [project](#project) (23 commands)
- [schema](#schema) (4 commands)
- [search](#search) (1 commands)
- [sobject](#sobject) (2 commands)
- [static-resource](#static-resource) (1 commands)
- [update](#update) (1 commands)
- [version](#version) (1 commands)
- [visualforce](#visualforce) (2 commands)
- [whatsnew](#whatsnew) (1 commands)
- [which](#which) (1 commands)

---

## agent

*15 commands in this topic*

### agent activate

**Activate an agent in an org.**

Activating an agent makes it immediately available to your users. An agent must be active before you can preview it with the "agent preview" CLI command or VS Code.

You must know the agent's API name to activate it; you can either be prompted for it or you can specify it with the --api-name flag. Find the agent's API name in its Agent Details page of your org's Agentforce Studio UI in Setup.

#### Usage

```bash
sf agent activate [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `-o, --target-org` | string (required) | Username or alias of the target org. Not required if the `target-org` configuration variable is alre... |
| `--api-version` | string | Override the api version used for api requests made by this command |
| `-n, --api-name` | string | API name of the agent to activate. |

#### Examples

Activate an agent in your default target org by being prompted:

```bash
sf agent activate
```

Activate an agent with API name Resort_Manager in the org with alias "my-org":

```bash
sf agent activate --api-name Resort_Manager --target-org my-org
```

> *Plugin: @salesforce/plugin-agent*


### agent create

**Create an agent in your org using a local agent spec file.**

NOTE: This command creates an agent that doesn't use Agent Script as its blueprint. We generally don't recommend you use this workflow to create an agent. Rather, use the "agent generate|validate|publish authoring-bundle" commands to author agents that use the Agent Script language. See "Author an Agent" (https://developer.salesforce.com/docs/einstein/genai/guide/agent-dx-nga-author-agent.html) for details.

To run this command, you must have an agent spec file, which is a YAML file that define the agent properties and contains a list of AI-generated topics. Topics define the range of jobs the agent can handle. Use the "agent generate agent-spec" CLI command to generate an agent spec file. Then specify the file to this command using the --spec flag, along with the name (label) of the new agent with the --name flag. If you don't specify any of the required flags, the command prompts you.

When this command completes, your org contains the new agent, which you can then edit and customize in the Agent Builder UI. The new agent's topics are the same as the ones listed in the agent spec file. The agent might also have some AI-generated actions, or you can add them. This command also retrieves all the metadata files associated with the new agent to your local Salesforce DX project.

Use the --preview flag to review what the agent looks like without actually saving it in your org. When previewing, the command creates a JSON file in the current directory with all the agent details. The name of the JSON file is the agent's API name and a timestamp.

To open the new agent in your org's Agent Builder UI, run this command: "sf org open agent --api-name <api-name>".

#### Usage

```bash
sf agent create [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `-o, --target-org` | string (required) | Username or alias of the target org. Not required if the `target-org` configuration variable is alre... |
| `--api-version` | string | Override the api version used for api requests made by this command |
| `--name` | string | Name (label) of the new agent. |
| `--api-name` | string | API name of the new agent; if not specified, the API name is derived from the agent name (label); th... |
| `--spec` | string | Path to an agent spec file. |
| `--preview` | boolean | Preview the agent without saving it in your org. |
| `--planner-id` | string | An existing GenAiPlannerBundle ID to associate with the agent. |

#### Examples

Create an agent by being prompted for the required information, such as the agent spec file and agent name, and then create it in your default org:

```bash
sf agent create
```

Create an agent by specifying the agent name, API name, and spec file with flags; use the org with alias "my-org"; the command fails if the API name is already being used in your org:

```bash
sf agent create --name "Resort Manager" --api-name Resort_Manager --spec specs/resortManagerAgent.yaml --target-org my-org
```

Preview the creation of an agent named "Resort Manager" and use your default org:

```bash
sf agent create --name "Resort Manager" --spec specs/resortManagerAgent.yaml --preview
```

> *Plugin: @salesforce/plugin-agent*


### agent deactivate

**Deactivate an agent in an org.**

Deactivating an agent makes it unavailable to your users. To make changes to an agent, such as adding or removing topics or actions, you must deactivate it. You can't preview an agent with the "agent preview" CLI command or VS Code if it's deactivated.

You must know the agent's API name to deactivate it; you can either be prompted for it or you can specify it with the --api-name flag. Find the agent's API name in its Agent Details page of your org's Agentforce Studio UI in Setup.

#### Usage

```bash
sf agent deactivate [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `-o, --target-org` | string (required) | Username or alias of the target org. Not required if the `target-org` configuration variable is alre... |
| `--api-version` | string | Override the api version used for api requests made by this command |
| `-n, --api-name` | string | API name of the agent to deactivate. |

#### Examples

Deactivate an agent in your default target org by being prompted:

```bash
sf agent deactivate
```

Deactivate the agent Resort_Manager in the org with alias "my_org":

```bash
sf agent deactivate --api-name Resort_Manager --target-org my-org
```

> *Plugin: @salesforce/plugin-agent*


### agent generate agent-spec

**Generate an agent spec, which is a YAML file that captures what an agent can do.**

An agent spec is a YAML-formatted file that contains basic information about the agent, such as its role, company description, and an AI-generated list of topics based on this information. Topics define the range of jobs your agent can handle.

Use flags, such as --role and --company-description, to provide details about your company and the role that the agent plays in your company. If you prefer, you can also be prompted for the basic information; use --full-interview to be prompted for all required and optional properties. Upon command execution, the large language model (LLM) associated with your org uses the provided information to generate a list of topics for the agent. Because the LLM uses the company and role information to generate the topics, we recommend that you provide accurate, complete, and specific details so the LLM generates the best and most relevant topics. Once generated, you can edit the spec file; for example, you can remove topics that don't apply or change a topic's description.

You can also iterate the spec generation process by using the --spec flag to pass an existing agent spec file to this command, and then using the --role, --company-description, etc, flags to refine your agent properties. Iteratively improving the description of your agent allows the LLM to generate progressively better topics.

You can also specify other agent properties, such as a custom prompt template, how to ground the prompt template to add context to the agent's prompts, the tone of the prompts, and the username of a user in the org to assign to the agent.

When your agent spec is ready, generate an authoring bundle from it by passing the spec file to the --spec flag of the "agent generate authoring-bundle" CLI command. An authoring bundle is a metadata type that contains an Agent Script file, which is the blueprint for an agent. (While not recommended, you can also use the agent spec file to immediately create an agent with the "agent create" command. We don't recommend this workflow because these types of agents don't use Agent Script, and are thus less flexible and more difficult to maintain.)

#### Usage

```bash
sf agent generate agent-spec [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `-o, --target-org` | string (required) | Username or alias of the target org. Not required if the `target-org` configuration variable is alre... |
| `--api-version` | string | Override the api version used for api requests made by this command |
| `--type` | string | Type of agent to create. Internal types are copilots used internally by your company and customer ty... |
| `--role` | string | Role of the agent. |
| `--company-name` | string | Name of your company. |
| `--company-description` | string | Description of your company. |
| `--company-website` | string | Website URL of your company. |
| `--max-topics` | string | Maximum number of topics to generate in the agent spec; default is 5. |
| `--agent-user` | string | Username of a user in your org to assign to your agent; determines what your agent can access and do... |
| `--enrich-logs` | string | Adds agent conversation data to event logs so you can view all agent session activity in one place. |
| `--tone` | string | Conversational style of the agent, such as how it expresses your brand personality in its messages t... |
| `--spec` | string | Agent spec file, in YAML format, to use as input to the command. |
| `--output-file` | string | Path for the generated YAML agent spec file; can be an absolute or relative path. |
| `--full-interview` | boolean | Prompt for both required and optional flags. |
| `--prompt-template` | string | API name of a customized prompt template to use instead of the default prompt template. |
| `--grounding-context` | string | Context information and personalization that's added to your prompts when using a custom prompt temp... |
| `--force-overwrite` | boolean | Don't prompt the user to confirm that an existing spec file will be overwritten. |

#### Examples

Generate an agent spec in the default location and use flags to specify the agent properties, such as its role and your company details; use your default org:

```bash
sf agent generate agent-spec --type customer --role "Field customer complaints and manage employee schedules." --company-name "Coral Cloud Resorts" --company-description "Provide customers with exceptional destination activities, unforgettable experiences, and reservation services."
```

Generate an agent spec by being prompted for the required agent properties and generate a maxiumum of 5 topics; write the generated file to the "specs/resortManagerSpec.yaml" file and use the org with alias "my-org":

```bash
sf agent generate agent-spec --max-topics 5 --output-file specs/resortManagerAgent.yaml --target-org my-org
```

Be prompted for all required and optional agent properties; use your default org:

```bash
sf agent generate agent-spec --full-interview
```

Specify an existing agent spec file called "specs/resortManagerAgent.yaml", and then overwrite it with a new version that contains newly AI-generated topics based on the updated role information passed in with the --role flag:

```bash
sf agent generate agent-spec --spec specs/resortManagerAgent.yaml --output-file specs/resortManagerAgent.yaml --role "Field customer complaints, manage employee schedules, and ensure all resort operations are running smoothly"
```

Specify that the conversational tone of the agent is formal and to attach the "resortmanager@myorg.com" username to it; be prompted for the required properties and use your default org:

```bash
sf agent generate agent-spec --tone formal --agent-user resortmanager@myorg.com
```

> *Plugin: @salesforce/plugin-agent*


### agent generate authoring-bundle

**Generate an authoring bundle from an existing agent spec YAML file.**

Authoring bundles are metadata components that contain an agent's Agent Script file. The Agent Script file is the agent's blueprint; it fully describes what the agent can do using the Agent Script language.

Use this command to generate a new authoring bundle based on an agent spec YAML file, which you create with the "agent generate agent-spec" command. The agent spec YAML file is a high-level description of the agent; it describes its essence rather than exactly what it can do.

The metadata type for authoring bundles is aiAuthoringBundle, which consist of a standard "<bundle-api-name>.bundle-meta.xml" metadata file and the Agent Script file (with extension ".agent"). When you run this command, the new authoring bundle is generated in the force-app/main/default/aiAuthoringBundles/<bundle-api-name> directory. Use the --output-dir flag to generate them elsewhere.

After you generate the initial authoring bundle, code the Agent Script file so your agent behaves exactly as you want. The Agent Script file generated by this command is just a first draft of your agent! Interactively test the agent by conversing with it using the "agent preview" command. Then publish the agent to your org with the "agent publish authoring-bundle" command.

This command requires an org because it uses it to access an LLM for generating the Agent Script file.

#### Usage

```bash
sf agent generate authoring-bundle [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `-o, --target-org` | string (required) | Username or alias of the target org. Not required if the `target-org` configuration variable is alre... |
| `--api-name` | string | API name of the new authoring bundle; if not specified, the API name is derived from the authoring b... |
| `--api-version` | string | Override the api version used for api requests made by this command |
| `-f, --spec` | string | Path to the agent spec YAML file; if not specified, the command provides a list that you can choose ... |
| `-d, --output-dir` | string | Directory where the authoring bundle files are generated. |
| `-n, --name` | string | Name (label) of the authoring bundle; if not specified, you're prompted for the name. |

#### Examples

Generate an authoring bundle by being prompted for all required values, such as the agent spec YAML file, the bundle name, and the API name; use your default org:

```bash
sf agent generate authoring-bundle
```

Generate an authoring bundle from the "specs/agentSpec.yaml" agent spec YAML file and give it the label "My Authoring Bundle"; use your default org:

```bash
sf agent generate authoring-bundle --spec specs/agentSpec.yaml --name "My Authoring Bundle"
```

Similar to previous example, but generate the authoring bundle files in the "other-package-dir/main/default" package directory; use the org with alias "my-dev-org":

```bash
sf agent generate authoring-bundle --spec specs/agentSpec.yaml --name "My Authoring Bundle" --output-dir other-package-dir/main/default --target-org my-dev-org
```

> *Plugin: @salesforce/plugin-agent*


### agent generate template

**Generate an agent template from an existing agent in your DX project so you can then package the template in a managed package.**

At a high-level, agents are defined by the Bot, BotVersion, and GenAiPlannerBundle metadata types. The GenAiPlannerBundle type in turn defines the agent's topics and actions. This command uses the metadata files for these three types, located in your local DX project, to generate a BotTemplate file for a specific agent (Bot). You then use the BotTemplate file, along with the GenAiPlannerBundle file that references the BotTemplate, to package the template in a managed package that you can share between orgs or on AppExchange.

Use the --agent-file flag to specify the relative or full pathname of the Bot metadata file, such as force-app/main/default/bots/My_Awesome_Agent/My_Awesome_Agent.bot-meta.xml. A single Bot can have multiple BotVersions, so use the --agent-version flag to specify the version. The corresponding BotVersion file must exist locally. For example, if you specify "--agent-version 4", then the file force-app/main/default/bots/My_Awesome_Agent/v4.botVersion-meta.xml must exist.

The new BotTemplate file is generated in the "botTemplates" directory in your local package directory, and has the name <Agent_API_name>_v<Version>_Template.botTemplate-meta.xml, such as force-app/main/default/botTemplates/My_Awesome_Agent_v4_Template.botTemplate-meta.xml. The command displays the full pathname of the generated files when it completes.

#### Usage

```bash
sf agent generate template [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `--api-version` | string | Override the api version used for api requests made by this command |
| `--agent-version` | string (required) | Version of the agent (BotVersion). |
| `-f, --agent-file` | string (required) | Path to an agent (Bot) metadata file. |

#### Examples

Generate an agent template from a Bot metadata file in your DX project that corresponds to the My_Awesome_Agent agent; use version 1 of the agent.

```bash
sf agent generate template --agent-file force-app/main/default/bots/My_Awesome_Agent/My_Awesome_Agent.bot-meta.xml --agent-version 1
```

> *Plugin: @salesforce/plugin-agent*


### agent generate test-spec

**Generate an agent test spec, which is a YAML file that lists the test cases for testing a specific agent.**

The first step when using Salesforce CLI to create an agent test in your org is to use this interactive command to generate a local YAML-formatted test spec file. The test spec YAML file contains information about the agent being tested, such as its API name, and then one or more test cases. This command uses the metadata components in your DX project when prompting for information, such as the agent API name; it doesn't look in your org.

To generate a specific agent test case, this command prompts you for this information; when possible, the command provides a list of options for you to choose from:

- Utterance: Natural language statement, question, or command used to test the agent.
- Expected topic: API name of the topic you expect the agent to use when responding to the utterance.
- Expected actions: One or more API names of the expection actions the agent takes.
- Expected outcome: Natural language description of the outcome you expect.
- (Optional) Custom evaluation: Test an agent's response for specific strings or numbers.
- (Optional) Conversation history: Boilerplate for additional context you can add to the test in the form of a conversation history.

When your test spec is ready, you then run the "agent test create" command to actually create the test in your org and synchronize the metadata with your DX project. The metadata type for an agent test is AiEvaluationDefinition.

If you have an existing AiEvaluationDefinition metadata XML file in your DX project, you can generate its equivalent YAML test spec file with the --from-definition flag.

#### Usage

```bash
sf agent generate test-spec [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--flags-dir` | string | Import flag values from a directory. |
| `-d, --from-definition` | string | Filepath to the AIEvaluationDefinition metadata XML file in your DX project that you want to convert... |
| `--force-overwrite` | boolean | Don't prompt for confirmation when overwriting an existing test spec YAML file. |
| `-f, --output-file` | string | Name of the generated test spec YAML file. Default value is "specs/<AGENT_API_NAME>-testSpec.yaml". |

#### Examples

Generate an agent test spec YAML file interactively:

```bash
sf agent generate test-spec
```

Generate an agent test spec YAML file and specify a name for the new file; if the file exists, overwrite it without confirmation:

```bash
sf agent generate test-spec --output-file specs/Resort_Manager-new-version-testSpec.yaml --force-overwrite
```

Generate an agent test spec YAML file from an existing AiEvaluationDefinition metadata XML file in your DX project:

```bash
sf agent generate test-spec --from-definition force-app//main/default/aiEvaluationDefinitions/Resort_Manager_Tests.aiEvaluationDefinition-meta.xml
```

> *Plugin: @salesforce/plugin-agent*


### agent preview

**Interact with an agent to preview how it responds to your statements, questions, and commands (utterances).**

Use this command to have a natural language conversation with an agent while you code its Agent Script file. Previewing an agent works like an initial test to make sure it responds to your utterances as you expect. For example, you can test that the agent uses a particular topic when asked a question, and then whether it invokes the correct action associated with that topic. This command is the CLI-equivalent of the Preview panel in your org's Agentforce Builder UI.

This command uses the agent's local authoring bundle, which contains its Agent Script file. You can let the command provide a list of authoring bundles (labeled "(Agent Script)") to choose from or use the --authoring-bundle flag to specify a bundle's API name.

You can use these two modes when previewing an agent from its Agent Script file:

- Simulated mode (Default): Uses only the Agent Script file to converse, and it simulates (mocks) all the actions. Use this mode if none of the Apex classes, flows, and prompt templates that implement your actions are available yet. The LLM uses the information about topics in the Agent Script file to simulate what the action does or how it responds.
- Live mode: Uses the actual Apex classes, flows, and prompt templates in your development org in the agent preview. If you've changed the Apex classe, flows, or prompt templates in your local DX project, then you must deploy them to your development org if you want to use them in your live preview. You can use the Apex Replay Debugger to debug your Apex classes when using live mode.

The interface is simple: in the "Start typing..." prompt, enter a statement, question, or command; when you're done, enter Return. Your utterance is posted on the right along with a timestamp. The agent then responds on the left. To exit the conversation, hit ESC or Control+C.

When the session concludes, the command asks if you want to save the API responses and chat transcripts. By default, the files are saved to the "./temp/agent-preview" directory. Specify a new default directory with the --output-dir flag.

NOTE: You can also use this command to connect to a published and active agent, which are labeled "(Published)" if you let this command provide the list of agents to preview. That use case, however, requires additional security and configuration in both your org and your DX project. The examples in this help are for previewing an agent from its Agent Script file in your DX project and require only simple authorization of your org, such as with the "org login web" command. The --client-app and --api-name flags are used only for previewing published and active agents, they don't apply to Agent Script agents. See "Connect to a Published Agent" in the "Agentforce Developer Guide" for complete documentation: https://developer.salesforce.com/docs/einstein/genai/guide/agent-dx-preview.html.

#### Usage

```bash
sf agent preview [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--flags-dir` | string | Import flag values from a directory. |
| `-o, --target-org` | string (required) | Username or alias of the target org. Not required if the `target-org` configuration variable is alre... |
| `--api-version` | string | Override the api version used for api requests made by this command |
| `-c, --client-app` | string | Name of the linked client app to use for the connection to the published and active agent. |
| `-n, --api-name` | string | API name of the published and active agent you want to interact with. |
| `--authoring-bundle` | string | API name of the authoring bundle metadata component that contains the agent's Agent Script file. |
| `-d, --output-dir` | string | Directory where conversation transcripts are saved. |
| `-x, --apex-debug` | boolean | Enable Apex debug logging during the agent preview conversation. |
| `--use-live-actions` | boolean | Use real actions in the org; if not specified, preview uses AI to simulate (mock) actions. |

#### Examples

Preview an agent in simulated mode by choosing from a list of authoring bundles provided by the command; use the org with alias "my-dev-org":

```bash
sf agent preview --target-org my-dev-org
```

Preview an agent in live mode by choosing from a list of authoring bundles. Save the conversation transcripts to the "./transcripts/my-preview" directory, enable the Apex debug logs, and use your default org:

```bash
sf agent preview --use-live-actions --apex-debug --output-dir transcripts/my-preview
```

> *Plugin: @salesforce/plugin-agent*


### agent publish authoring-bundle

**Publish an authoring bundle to your org, which results in a new agent or a new version of an existing agent.**

An authoring bundle is a metadata type (named aiAuthoringBundle) that provides the blueprint for an agent. The metadata type contains two files: the standard metatada XML file and an Agent Script file (extension ".agent") that fully describes the agent using the Agent Script language.

When you publish an authoring bundle to your org, a number of things happen. First, this command validates that the Agent Script file successfully compiles. If there are compilation errors, the command exits and you must fix the Agent Script file to continue. Once the Agent Script file compiles, then it's published to the org, which in turn creates new associated metadata (Bot, BotVersion, GenAiX), or new versions of the metadata if the agent already exists. The new or updated metadata is retrieved back to your DX project, and then the authoring bundle metadata (AiAuthoringBundle) is deployed to your org. 

This command uses the API name of the authoring bundle.

#### Usage

```bash
sf agent publish authoring-bundle [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `-o, --target-org` | string (required) | Username or alias of the target org. Not required if the `target-org` configuration variable is alre... |
| `--api-version` | string | Override the api version used for api requests made by this command |
| `-n, --api-name` | string | API name of the authoring bundle you want to publish; if not specified, the command provides a list ... |

#### Examples

Publish an authoring bundle by being prompted for its API name; use your default org:

```bash
sf agent publish authoring-bundle
```

Publish an authoring bundle with API name MyAuthoringBundle to the org with alias "my-dev-org":

```bash
sf agent publish authoring-bundle --api-name MyAuthoringbundle --target-org my-dev-org
```

> *Plugin: @salesforce/plugin-agent*


### agent test create

**Create an agent test in your org using a local test spec YAML file.**

To run this command, you must have an agent test spec file, which is a YAML file that lists the test cases for testing a specific agent. Use the "agent generate test-spec" CLI command to generate a test spec file. Then specify the file to this command with the --spec flag, or run this command with no flags to be prompted.

When this command completes, your org contains the new agent test, which you can view and edit using the Testing Center UI. This command also retrieves the metadata component (AiEvaluationDefinition) associated with the new test to your local Salesforce DX project and displays its filename.

After you've created the test in the org, use the "agent test run" command to run it.

#### Usage

```bash
sf agent test create [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `--api-name` | string | API name of the new test; the API name must not exist in the org. |
| `--spec` | string | Path to the test spec YAML file. |
| `-o, --target-org` | string (required) | Username or alias of the target org. Not required if the `target-org` configuration variable is alre... |
| `--api-version` | string | Override the api version used for api requests made by this command |
| `--preview` | boolean | Preview the test metadata file (AiEvaluationDefinition) without deploying to your org. |
| `--force-overwrite` | boolean | Don't prompt for confirmation when overwriting an existing test (based on API name) in your org. |

#### Examples

Create an agent test interactively and be prompted for the test spec and API name of the test in the org; use the default org:

```bash
sf agent test create
```

Create an agent test and use flags to specify all required information; if a test with same API name already exists in the org, overwrite it without confirmation. Use the org with alias "my-org":

```bash
sf agent test create --spec specs/Resort_Manager-testSpec.yaml --api-name Resort_Manager_Test --force-overwrite --target-org my-org
```

Preview what the agent test metadata (AiEvaluationDefinition) looks like without deploying it to your default org:

```bash
sf agent test create --spec specs/Resort_Manager-testSpec.yaml --api-name Resort_Manager_Test --preview
```

> *Plugin: @salesforce/plugin-agent*


### agent test list

**List the available agent tests in your org.**

The command outputs a table with the name (API name) of each test along with its unique ID and the date it was created in the org.

#### Usage

```bash
sf agent test list [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `-o, --target-org` | string (required) | Username or alias of the target org. Not required if the `target-org` configuration variable is alre... |
| `--api-version` | string | Override the api version used for api requests made by this command |

#### Examples

List the agent tests in your default org:

```bash
sf agent test list
```

List the agent tests in an org with alias "my-org""

```bash
sf agent test list --target-org my-org
```

> *Plugin: @salesforce/plugin-agent*


### agent test results

**Get the results of a completed agent test run.**

This command requires a job ID, which the original "agent test run" command displays when it completes. You can also use the --use-most-recent flag to see results for the most recently run agent test.

By default, this command outputs test results in human-readable tables for each test case. The tables show whether the test case passed, the expected and actual values, the test score, how long the test took, and more. Use the --result-format to display the test results in JSON or Junit format. Use the --output-dir flag to write the results to a file rather than to the terminal.

#### Usage

```bash
sf agent test results [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `-o, --target-org` | string (required) | Username or alias of the target org. Not required if the `target-org` configuration variable is alre... |
| `--api-version` | string | Override the api version used for api requests made by this command |
| `-i, --job-id` | string (required) | Job ID of the completed agent test run. |
| `--result-format` | string | Format of the agent test run results. |
| `-d, --output-dir` | string | Directory to write the agent test results into. |
| `--verbose` | boolean | Show generated data in the test results output. |

#### Examples

Get the results of an agent test run in your default org using its job ID:

```bash
sf agent test results --job-id 4KBfake0000003F4AQ
```

Get the results of the most recently run agent test in an org with alias "my-org":

```bash
sf agent test results --use-most-recent --target-org my-org
```

Get the results of the most recently run agent test in your default org, and write the JSON-formatted results into a directory called "test-results":

```bash
sf agent test results --use-most-recent --output-dir ./test-results --result-format json
```

> *Plugin: @salesforce/plugin-agent*


### agent test resume

**Resume an agent test that you previously started in your org so you can view the test results.**

This command requires a job ID, which the original "agent test run" command displays when it completes. You can also use the --use-most-recent flag to see results for the most recently run agent test.

Use the --wait flag to specify the number of minutes for this command to wait for the agent test to complete; if the test completes by the end of the wait time, the command displays the test results. If not, the CLI returns control of the terminal to you, and you must run "agent test resume" again.

By default, this command outputs test results in human-readable tables for each test case. The tables show whether the test case passed, the expected and actual values, the test score, how long the test took, and more. Use the --result-format to display the test results in JSON or Junit format. Use the --output-dir flag to write the results to a file rather than to the terminal.

#### Usage

```bash
sf agent test resume [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `-o, --target-org` | string (required) | Username or alias of the target org. Not required if the `target-org` configuration variable is alre... |
| `--api-version` | string | Override the api version used for api requests made by this command |
| `-i, --job-id` | string | Job ID of the original agent test run. |
| `-r, --use-most-recent` | boolean | Use the job ID of the most recent agent test run. |
| `-w, --wait` | string | Number of minutes to wait for the command to complete and display results to the terminal window. |
| `--result-format` | string | Format of the agent test run results. |
| `-d, --output-dir` | string | Directory to write the agent test results into. |
| `--verbose` | boolean | Show generated data in the test results output. |

#### Examples

Resume an agent test in your default org using a job ID:

```bash
sf agent test resume --job-id 4KBfake0000003F4AQ
```

Resume the most recently-run agent test in an org with alias "my-org" org; wait 10 minutes for the tests to finish:

```bash
sf agent test resume --use-most-recent --wait 10 --target-org my-org
```

Resume the most recent agent test in your default org, and write the JSON-formatted results into a directory called "test-results":

```bash
sf agent test resume --use-most-recent --output-dir ./test-results --result-format json
```

> *Plugin: @salesforce/plugin-agent*


### agent test run

**Start an agent test in your org.**

Use the --api-name flag to specify the name of the agent test you want to run. Use the output of the "agent test list" command to get the names of all the available agent tests in your org.

By default, this command starts the agent test in your org, but it doesn't wait for the test to finish. Instead, it displays the "agent test resume" command, with a job ID, that you execute to see the results of the test run, and then returns control of the terminal window to you. Use the --wait flag to specify the number of minutes for the command to wait for the agent test to complete; if the test completes by the end of the wait time, the command displays the test results. If not, run "agent test resume".

By default, this command outputs test results in human-readable tables for each test case, if the test completes in time. The tables show whether the test case passed, the expected and actual values, the test score, how long the test took, and more. Use the --result-format to display the test results in JSON or Junit format. Use the --output-dir flag to write the results to a file rather than to the terminal.

#### Usage

```bash
sf agent test run [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `-o, --target-org` | string (required) | Username or alias of the target org. Not required if the `target-org` configuration variable is alre... |
| `--api-version` | string | Override the api version used for api requests made by this command |
| `-n, --api-name` | string | API name of the agent test to run; corresponds to the name of the AiEvaluationDefinition metadata co... |
| `-w, --wait` | string | Number of minutes to wait for the command to complete and display results to the terminal window. |
| `--result-format` | string | Format of the agent test run results. |
| `-d, --output-dir` | string | Directory to write the agent test results into. |
| `--verbose` | boolean | Show generated data in the test results output. |

#### Examples

Start an agent test called Resort_Manager_Test for an agent in your default org, don't wait for the test to finish:

```bash
sf agent test run --api-name Resort_Manager_Test
```

Start an agent test for an agent in an org with alias "my-org" and wait for 10 minutes for the test to finish:

```bash
sf agent test run --api-name Resort_Manager_Test --wait 10 --target-org my-org
```

Start an agent test and write the JSON-formatted results into a directory called "test-results":

```bash
sf agent test run --api-name Resort_Manager_Test --wait 10 --output-dir ./test-results --result-format json
```

> *Plugin: @salesforce/plugin-agent*


### agent validate authoring-bundle

**Validate an authoring bundle to ensure its Agent Script file compiles successfully and can be used to publish an agent.**

An authoring bundle is a metadata type (named aiAuthoringBundle) that provides the blueprint for an agent. The metadata type contains two files: the standard metatada XML file and an Agent Script file (extension ".agent") that fully describes the agent using the Agent Script language.

This command validates that the Agent Script file in the authoring bundle compiles without errors so that you can later publish the bundle to your org. Use this command while you code the Agent Script file to ensure that it's valid. If the validation fails, the command outputs the list of syntax errors, a brief description of the error, and the location in the Agent Script file where the error occurred.

This command uses the API name of the authoring bundle. If you don't provide an API name with the --api-name flag, the command searches the current DX project and outputs a list of authoring bundles that it found for you to choose from.

#### Usage

```bash
sf agent validate authoring-bundle [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `-o, --target-org` | string (required) | Username or alias of the target org. Not required if the `target-org` configuration variable is alre... |
| `--api-version` | string | Override the api version used for api requests made by this command |
| `-n, --api-name` | string | API name of the authoring bundle you want to validate; if not specified, the command provides a list... |

#### Examples

Validate an authoring bundle by being prompted for its API name; use your default org:

```bash
sf agent validate authoring-bundle
```

Validate an authoring bundle with API name MyAuthoringBundle; use the org with alias "my-dev-org":

```bash
sf agent validate authoring-bundle --api-name MyAuthoringBundle --target-org my-dev-org
```

> *Plugin: @salesforce/plugin-agent*


---

## alias

*3 commands in this topic*

### alias list

**List all aliases currently set on your local computer.**

Aliases are global, which means that you can use all the listed aliases in any Salesforce DX project on your computer.

#### Usage

```bash
sf alias list [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `--loglevel` | string |  |

#### Examples

List all the aliases you've set:

```bash
sf alias list
```

#### Aliases

`force:alias:list`

> *Plugin: @salesforce/plugin-settings*


### alias set

**Set one or more aliases on your local computer.**

Aliases are user-defined short names that make it easier to use the CLI. For example, users often set an alias for a scratch org usernames because they're long and unintuitive. Check the --help of a CLI command to determine where you can use an alias.

You can associate an alias with only one value at a time. If you set an alias multiple times, the alias points to the most recent value. Aliases are global; after you set an alias, you can use it in any Salesforce DX project on your computer.

Use quotes to specify an alias value that contains spaces. You typically use an equal sign to set your alias, although you don't need it if you're setting a single alias in a command.

#### Usage

```bash
sf alias set [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `--loglevel` | string |  |

#### Examples

Set an alias for a scratch org username:

```bash
sf alias set my-scratch-org=test-sadbiytjsupn@example.com
```

Set multiple aliases with a single command:

```bash
sf alias set my-scratch-org=test-sadbiytjsupn@example.com my-other-scratch-org=test-ss0xut7txzxf@example.com
```

Set an alias that contains spaces:

```bash
sf alias set my-alias='alias with spaces'
```

Set a single alias without using an equal sign:

```bash
sf alias set my-scratch-org test-ss0xut7txzxf@example.com
```

#### Aliases

`force:alias:set`

> *Plugin: @salesforce/plugin-settings*


### alias unset

**Unset one or more aliases that are currently set on your local computer.**

Aliases are global, so when you unset one it's no longer available in any Salesforce DX project.

#### Usage

```bash
sf alias unset [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `--loglevel` | string |  |
| `-a, --all` | boolean | Unset all currently set aliases. |
| `-p, --no-prompt` | boolean | Don't prompt the user for confirmation when unsetting all aliases. |

#### Examples

Unset an alias:

```bash
sf alias unset my-alias
```

Unset multiple aliases with a single command:

```bash
sf alias unset my-alias my-other-alias
```

Unset all aliases:

```bash
sf alias unset --all [--no-prompt]
```

#### Aliases

`force:alias:unset`

> *Plugin: @salesforce/plugin-settings*


---

## analytics

*1 commands in this topic*

### analytics generate template

**Generate a simple Analytics template.**

The metadata files associated with the Analytics template must be contained in a parent directory called "waveTemplates" in your package directory. Either run this command from an existing directory of this name, or use the --output-dir flag to generate one or point to an existing one.

#### Usage

```bash
sf analytics generate template [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `-d, --output-dir` | string | Directory for saving the created files. |
| `--api-version` | string | Override the api version used for api requests made by this command |
| `-n, --name` | string (required) | Name of the Analytics template. |
| `--loglevel` | string |  |

#### Examples

Generate the metadata files for a simple Analytics template file called myTemplate in the force-app/main/default/waveTemplates directory:

```bash
sf analytics generate template --name myTemplate --output-dir force-app/main/default/waveTemplates
```

#### Aliases

`force:analytics:template:create`

> *Plugin: @salesforce/plugin-templates*


---

## apex

*8 commands in this topic*

### apex generate class

**Generate an Apex class.**

Generates the Apex *.cls file and associated metadata file. These files must be contained in a parent directory called "classes" in your package directory. Either run this command from an existing directory of this name, or use the --output-dir flag to generate one or point to an existing one.

#### Usage

```bash
sf apex generate class [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `-n, --name` | string (required) | Name of the generated Apex class. |
| `-t, --template` | string | Template to use for file creation. |
| `-d, --output-dir` | string | Directory for saving the created files. |
| `--api-version` | string | Override the api version used for api requests made by this command |
| `--loglevel` | string |  |

#### Examples

Generate two metadata files associated with the MyClass Apex class (MyClass.cls and MyClass.cls-meta.xml) in the current directory:

```bash
sf apex generate class --name MyClass
```

Similar to previous example, but generates the files in the "force-app/main/default/classes" directory:

```bash
sf apex generate class --name MyClass --output-dir force-app/main/default/classes
```

#### Aliases

`force:apex:class:create`

> *Plugin: @salesforce/plugin-templates*


### apex generate trigger

**Generate an Apex trigger.**

Generates the Apex trigger *.trigger file and associated metadata file. These files must be contained in a parent directory called "triggers" in your package directory. Either run this command from an existing directory of this name, or use the --output-dir flag to generate one or point to an existing one.

If you don't specify the --sobject flag, the .trigger file contains the generic placeholder SOBJECT; replace it with the Salesforce object you want to generate a trigger for. If you don't specify --event, "before insert" is used.

#### Usage

```bash
sf apex generate trigger [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `-n, --name` | string (required) | Name of the generated Apex trigger |
| `-t, --template` | string | Template to use for file creation. |
| `-d, --output-dir` | string | Directory for saving the created files. |
| `--api-version` | string | Override the api version used for api requests made by this command |
| `-s, --sobject` | string | Salesforce object to generate a trigger on. |
| `-e, --event` | string | Events that fire the trigger. |
| `--loglevel` | string |  |

#### Examples

Generate two files associated with the MyTrigger Apex trigger (MyTrigger.trigger and MyTrigger.trigger-meta.xml) in the current directory:

```bash
sf apex generate trigger --name MyTrigger
```

Similar to the previous example, but generate the files in the "force-app/main/default/triggers" directory:

```bash
sf apex generate trigger --name MyTrigger --output-dir force-app/main/default/triggers
```

Generate files for a trigger that fires on the Account object before and after an insert:

```bash
sf apex generate trigger --name MyTrigger --sobject Account --event "before insert,after insert"
```

#### Aliases

`force:apex:trigger:create`

> *Plugin: @salesforce/plugin-templates*


### apex get log

**Fetch the specified log or given number of most recent logs from the org.**

To get the IDs for your debug logs, run "sf apex log list". Executing this command without flags returns the most recent log.

#### Usage

```bash
sf apex get log [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `-o, --target-org` | string (required) | Username or alias of the target org. Not required if the `target-org` configuration variable is alre... |
| `--api-version` | string | Override the api version used for api requests made by this command |
| `--loglevel` | string |  |
| `-i, --log-id` | string | ID of the specific log to display. |
| `-n, --number` | string | Number of the most recent logs to display. |
| `-d, --output-dir` | string | Directory for saving the log files. |

#### Examples

Fetch the log in your default org using an ID:

```bash
sf apex get log --log-id <log id>
```

Fetch the log in the org with the specified username using an ID:

```bash
sf apex get log --log-id <log id> --target-org me@my.org
```

Fetch the two most recent logs in your default org:

```bash
sf apex get log --number 2
```

Similar to previous example, but save the two log files in the specified directory:

```bash
sf apex get log --output-dir /Users/sfdxUser/logs --number 2
```

#### Aliases

`force:apex:log:get`

> *Plugin: @salesforce/plugin-apex*


### apex get test

**Display test results for a specific asynchronous test run.**

Provide a test run ID to display test results for an enqueued or completed asynchronous test run. The test run ID is displayed after running the "sf apex test run" command.

To see code coverage results, use the --code-coverage flag with --result-format. The output displays a high-level summary of the test run and the code coverage values for classes in your org. If you specify human-readable result format, use the --detailed-coverage flag to see detailed coverage results for each test method run.

#### Usage

```bash
sf apex get test [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `-o, --target-org` | string (required) | Username or alias of the target org. Not required if the `target-org` configuration variable is alre... |
| `--api-version` | string | Override the api version used for api requests made by this command |
| `--loglevel` | string |  |
| `-i, --test-run-id` | string (required) | ID of the test run. |
| `-c, --code-coverage` | boolean | Retrieve code coverage results. |
| `--detailed-coverage` | boolean | Display detailed code coverage per test. |
| `-d, --output-dir` | string | Directory in which to store test result files. |
| `-r, --result-format` | string | Format of the test results. |
| `--concise` | boolean | Display only failed test results; works with human-readable output only. |

#### Examples

Display test results for your default org using a test run ID:

```bash
sf apex get test --test-run-id <test run id>
```

Similar to previous example, but output the result in JUnit format:

```bash
sf apex get test --test-run-id <test run id> --result-format junit
```

Also retrieve code coverage results and output in JSON format:

```bash
sf apex get test --test-run-id <test run id> --code-coverage --json
```

Specify a directory in which to save the test results from the org with the specified username (rather than your default org):

```bash
sf apex get test --test-run-id <test run id> --code-coverage --output-dir <path to outputdir> --target-org me@myorg'
```

#### Aliases

`force:apex:test:report`

> *Plugin: @salesforce/plugin-apex*


### apex list log

**Display a list of IDs and general information about debug logs.**

Run this command in a project to list the IDs and general information for all debug logs in your default org.

To fetch a specific log from your org, obtain the ID from this command's output, then run the “sf apex log get” command.

#### Usage

```bash
sf apex list log [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `-o, --target-org` | string (required) | Username or alias of the target org. Not required if the `target-org` configuration variable is alre... |
| `--api-version` | string | Override the api version used for api requests made by this command |
| `--loglevel` | string |  |

#### Examples

List the IDs and information about the debug logs in your default org:

```bash
sf apex list log
```

Similar to previous example, but use the org with the specified username:

```bash
sf apex list log --target-org me@my.org
```

#### Aliases

`force:apex:log:list`

> *Plugin: @salesforce/plugin-apex*


### apex run

**Execute anonymous Apex code entered on the command line or from a local file.**

If you don’t run this command from within a Salesforce DX project, you must specify the —-target-org flag.

To execute your code interactively, run this command with no flags. At the prompt, enter all your Apex code; press CTRL-D when you're finished. Your code is then executed in a single execute anonymous request.
For more information, see "Anonymous Blocks" in the Apex Developer Guide.

#### Usage

```bash
sf apex run [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `-o, --target-org` | string (required) | Username or alias of the target org. Not required if the `target-org` configuration variable is alre... |
| `--api-version` | string | Override the api version used for api requests made by this command |
| `--loglevel` | string |  |
| `-f, --file` | string | Path to a local file that contains Apex code. |

#### Examples

Execute the Apex code that's in the ~/test.apex file in the org with the specified username:

```bash
sf apex run --target-org testusername@salesforce.org --file ~/test.apex
```

Similar to previous example, but execute the code in your default org:

```bash
sf apex run --file ~/test.apex
```

Run the command with no flags to start interactive mode; the code will execute in your default org when you exit. At the prompt, start type Apex code and press the Enter key after each line. Press CTRL+D when finished.

```bash
sf apex run
```

#### Aliases

`force:apex:execute`

> *Plugin: @salesforce/plugin-apex*


### apex run test

**Invoke Apex tests in an org.**

Specify which tests to run by using the --class-names, --suite-names, or --tests flags. Alternatively, use the --test-level flag to run all the tests in your org, local tests, or specified tests.

To see code coverage results, use the --code-coverage flag with --result-format. The output displays a high-level summary of the test run and the code coverage values for classes in your org. If you specify human-readable result format, use the --detailed-coverage flag to see detailed coverage results for each test method run.

By default, Apex tests run asynchronously and immediately return a test run ID. You can use the --wait flag to specify the number of minutes to wait; if the tests finish in that timeframe, the command displays the results. If the tests haven't finished by the end of the wait time, the command displays a test run ID. Use the "sf apex get test --test-run-id" command to get the results.

To run both Apex and Flow tests together, run the "sf logic run test" CLI command, which has similar flags as this command, but expands the --tests flag to also include Flow tests.

You must have the "View All Data" system permission to use this command. The permission is disabled by default and can be enabled only by a system administrator.

NOTE: The testRunCoverage value (JSON and JUnit result formats) is a percentage of the covered lines and total lines from all the Apex classes evaluated by the tests in this run.

#### Usage

```bash
sf apex run test [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `-o, --target-org` | string (required) | Username or alias of the target org. Not required if the `target-org` configuration variable is alre... |
| `--api-version` | string | Override the api version used for api requests made by this command |
| `--loglevel` | string |  |
| `-c, --code-coverage` | boolean | Retrieve code coverage results. |
| `-d, --output-dir` | string | Directory in which to store test run files. |
| `-l, --test-level` | string | Level of tests to run; default is RunLocalTests. |
| `-n, --class-names` | string | Apex test class names to run; default is all classes. |
| `-r, --result-format` | string | Format of the test results. |
| `-s, --suite-names` | string | Apex test suite names to run. |
| `-t, --tests` | string | Apex test class names or IDs and, if applicable, test methods to run; default is all tests. |
| `-i, --poll-interval` | string | Number of seconds to wait between retries. |
| `-w, --wait` | string | Sets the streaming client socket timeout in minutes; specify a longer wait time if timeouts occur fr... |
| `-y, --synchronous` | boolean | Runs test methods from a single Apex class synchronously; if not specified, tests are run asynchrono... |
| `-v, --detailed-coverage` | boolean | Display detailed code coverage per test. |
| `--concise` | boolean | Display only failed test results; works with human-readable output only. |

#### Examples

Run all Apex tests and suites in your default org:

```bash
sf apex run test
```

Run the specified Apex test classes in your default org and display results in human-readable form:

```bash
sf apex run test --class-names MyClassTest --class-names MyOtherClassTest --result-format human
```

Run the specified Apex test suites in your default org and include code coverage results and additional details:

```bash
sf apex run test --suite-names MySuite --suite-names MyOtherSuite --code-coverage --detailed-coverage
```

Run the specified Apex tests in your default org and display results in human-readable output:

```bash
sf apex run test --tests MyClassTest.testCoolFeature --tests MyClassTest.testAwesomeFeature --tests AnotherClassTest --tests namespace.TheirClassTest.testThis --result-format human
```

Run all tests in the org with the specified username with the specified test level; save the output to the specified directory:

```bash
sf apex run test --test-level RunLocalTests --output-dir <path to outputdir> --target-org me@my.org
```

Run all tests in the org asynchronously:

```bash
sf apex run test --target-org myscratch
```

Run all tests synchronously; the command waits to display the test results until all tests finish:

```bash
sf apex run test --synchronous
```

Run specific tests using the --test-level flag:

```bash
sf apex run test --test-level RunLocalTests
```

Run Apex tests on all the methods in the specified class; output results in Test Anything Protocol (TAP) format and request code coverage results:

```bash
sf apex run test --class-names TestA --class-names TestB --result-format tap --code-coverage
```

Run Apex tests on methods specified using the standard Class.method notation; if you specify a test class without a method, the command runs all methods in the class:

```bash
sf apex run test --tests TestA.excitingMethod --tests TestA.boringMethod --tests TestB
```

Run Apex tests on methods specified using the standard Class.method notation with a namespace:

```bash
sf apex run test --tests ns.TestA.excitingMethod --tests ns.TestA.boringMethod --tests ns.TestB
```

#### Aliases

`force:apex:test:run`

> *Plugin: @salesforce/plugin-apex*


### apex tail log

**Activate debug logging and display logs in the terminal.**

You can also pipe the logs to a file.

#### Usage

```bash
sf apex tail log [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--flags-dir` | string | Import flag values from a directory. |
| `-o, --target-org` | string (required) | Username or alias of the target org. Not required if the `target-org` configuration variable is alre... |
| `--api-version` | string | Override the api version used for api requests made by this command |
| `--loglevel` | string |  |
| `-c, --color` | boolean | Apply default colors to noteworthy log lines. |
| `-d, --debug-level` | string | Debug level to set on the DEVELOPER_LOG trace flag for your user. |
| `-s, --skip-trace-flag` | boolean | Skip trace flag setup. Assumes that a trace flag and debug level are fully set up. |

#### Examples

Activate debug logging:

```bash
sf apex tail log
```

Specify a debug level:

```bash
sf apex tail log --debug-level MyDebugLevel
```

Skip the trace flag setup and apply default colors:

```bash
sf apex tail log --color --skip-trace-flag
```

#### Aliases

`force:apex:log:tail`

> *Plugin: @salesforce/plugin-apex*


---

## api

*2 commands in this topic*

### api request graphql

**Execute a GraphQL statement.**

Specify the GraphQL statement with the "--body" flag, either directly at the command line or with a file that contains the statement. You can query Salesforce records using a "query" statement or use mutations to modify Salesforce records.

This command uses the GraphQL API to query or modify Salesforce objects. For details about the API, and examples of queries and mutations, see https://developer.salesforce.com/docs/platform/graphql/guide/graphql-about.html.

#### Usage

```bash
sf api request graphql [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `-o, --target-org` | string (required) | Username or alias of the target org. Not required if the `target-org` configuration variable is alre... |
| `--api-version` | string | Override the api version used for api requests made by this command |
| `-S, --stream-to-file` | string | Stream responses to a file. |
| `-i, --include` | boolean | Include the HTTP response status and headers in the output. |
| `--body` | string (required) | File or content with the GraphQL statement. Specify "-" to read from standard input. |

#### Examples

Execute a GraphQL query on the Account object by specifying the query directly to the "--body" flag; the command uses your default org:

```bash
sf api request graphql --body "query accounts { uiapi { query { Account { edges { node { Id \n Name { value } } } } } } }"
```

Read the GraphQL statement from a file called "example.txt" and execute it on an org with alias "my-org":

```bash
sf api request graphql --body example.txt --target-org my-org
```

Pipe the GraphQL statement that you want to execute from standard input to the command:

```bash
$ echo graphql | sf api request graphql --body -
```

Write the output of the command to a file called "output.txt" and include the HTTP response status and headers:

```bash
sf api request graphql --body example.txt --stream-to-file output.txt --include
```

> *Plugin: @salesforce/plugin-api*


### api request rest

**Make an authenticated HTTP request using the Salesforce REST API.**

When sending the HTTP request with the "--body" flag, you can specify the request directly at the command line or with a file that contains the request.

For a full list of supported REST endpoints and resources, see https://developer.salesforce.com/docs/atlas.en-us.api_rest.meta/api_rest/resources_list.htm.

#### Usage

```bash
sf api request rest [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--flags-dir` | string | Import flag values from a directory. |
| `-o, --target-org` | string (required) | Username or alias of the target org. Not required if the `target-org` configuration variable is alre... |
| `-i, --include` | boolean | Include the HTTP response status and headers in the output. |
| `-X, --method` | string | HTTP method for the request. |
| `-H, --header` | string | HTTP header in "key:value" format. |
| `-f, --file` | string | JSON file that contains values for the request header, body, method, and URL. |
| `-S, --stream-to-file` | string | Stream responses to a file. |
| `-b, --body` | string | File or content for the body of the HTTP request. Specify "-" to read from standard input or "" for ... |

#### Arguments

| Argument | Description |
|----------|-------------|
| `url` | Salesforce API endpoint |

#### Examples

List information about limits in the org with alias "my-org":

```bash
sf api request rest 'services/data/v56.0/limits' --target-org my-org
```

List all endpoints in your default org; write the output to a file called "output.txt" and include the HTTP response status and headers:

```bash
sf api request rest '/services/data/v56.0/' --stream-to-file output.txt --include
```

Get the response in XML format by specifying the "Accept" HTTP header:

```bash
sf api request rest '/services/data/v56.0/limits' --header 'Accept: application/xml'
```

Create an account record using the POST method; specify the request details directly in the "--body" flag:

```bash
sf api request rest /services/data/v56.0/sobjects/account --body "{\"Name\" : \"Account from REST API\",\"ShippingCity\" : \"Boise\"}" --method POST
```

Create an account record using the information in a file called "info.json" (note the @ prefixing the file name):

```bash
sf api request rest '/services/data/v56.0/sobjects/account' --body @info.json --method POST
```

Update an account record using the PATCH method:

```bash
sf api request rest '/services/data/v56.0/sobjects/account/<Account ID>' --body "{\"BillingCity\": \"San Francisco\"}" --method PATCH
```

Store the values for the request header, body, and so on, in a file, which you then specify with the --file flag; see the description of --file for more information:

```bash
sf api request rest --file myFile.json
```

> *Plugin: @salesforce/plugin-api*


---

## autocomplete

*1 commands in this topic*

### autocomplete

Display autocomplete installation instructions.

#### Usage

```bash
sf autocomplete [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `-r, --refresh-cache` | boolean | Refresh cache (ignores displaying instructions) |

#### Arguments

| Argument | Description |
|----------|-------------|
| `shell` | Shell type |

#### Examples

```bash
$ sf autocomplete
```

```bash
$ sf autocomplete bash
```

```bash
$ sf autocomplete zsh
```

```bash
$ sf autocomplete powershell
```

```bash
$ sf autocomplete --refresh-cache
```

> *Plugin: @oclif/plugin-autocomplete*


---

## cmdt

*5 commands in this topic*

### cmdt generate field

**Generate a field for a custom metadata type based on the provided field type.**

Similar to a custom object, a custom metadata type has a list of custom fields that represent aspects of the metadata.

This command creates a metadata file that describes the new custom metadata type field. By default, the file is created in a "fields" directory in the current directory. Use the --output-directory to generate the file in the directory that contains the custom metadata type metdata files, such as "force-app/main/default/objects/MyCmdt__mdt" for the custom metadata type called MyCmdt.

#### Usage

```bash
sf cmdt generate field [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `--loglevel` | string |  |
| `-n, --name` | string (required) | Unique name for the field. |
| `-f, --type` | string (required) | Type of the field. |
| `-p, --picklist-values` | string | Picklist values; required for picklist fields. |
| `-s, --decimal-places` | string | Number of decimal places to use for number or percent fields. |
| `-l, --label` | string | Label for the field. |
| `-d, --output-directory` | string | Directory to store newly-created field definition files. |

#### Examples

Generate a metadata file for a custom checkbox field and add the file to the MyCmdt__mdt/fields directory:

```bash
sf cmdt generate field --name MyCheckboxField --type Checkbox --output-directory force-app/main/default/objects/MyCmdt__mdt
```

Generate a metadata file for a custom picklist field and add a few values:

```bash
sf cmdt generate field --name MyPicklistField --type Picklist --picklist-values A --picklist-values B --picklist-values C --output-directory force-app/main/default/objects/MyCmdt__mdt
```

Generate a metadata file for a custom number field and specify 2 decimal places:

```bash
sf cmdt generate field --name MyNumberField --type Number --decimal-places 2 --output-directory force-app/main/default/objects/MyCmdt__mdt
```

#### Aliases

`force:cmdt:field:create`, `cmdt:field:create`

> *Plugin: @salesforce/plugin-custom-metadata*


### cmdt generate fromorg

**Generate a custom metadata type and all its records from a Salesforce object.**

Use this command to migrate existing custom objects or custom settings in an org to custom metadata types. If a field of the Salesforce object is of an unsupported type, the field type is automatically converted to text. Run "sf cmdt generate field --help" to see the list of supported cmdt field types, listed in the --type flag summary. Use the --ignore-unsupported to ignore these fields.

This command creates the metadata files that describe the new custom metadata type and its fields in the "force-app/main/default/objects/TypeName__mdt" directory by default, where "TypeName" is the value of the required --dev-name flag. Use --type-output-directory to create them in a different directory.

#### Usage

```bash
sf cmdt generate fromorg [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `-o, --target-org` | string (required) | Username or alias of the target org. Not required if the `target-org` configuration variable is alre... |
| `--api-version` | string | Override the api version used for api requests made by this command |
| `--loglevel` | string |  |
| `-n, --dev-name` | string (required) | Name of the custom metadata type. |
| `-l, --label` | string | Label for the custom metadata type. |
| `-p, --plural-label` | string | Plural version of the label value; if blank, uses label. |
| `-v, --visibility` | string | Who can see the custom metadata type. |
| `-s, --sobject` | string (required) | API name of the source Salesforce object used to generate the custom metadata type. |
| `-i, --ignore-unsupported` | boolean | Ignore unsupported field types. |
| `-d, --type-output-directory` | string | Directory to store newly-created custom metadata type files. |
| `-r, --records-output-dir` | string | Directory to store newly-created custom metadata record files. |

#### Examples

Generate a custom metadata type from a custom object called MySourceObject__c in your default org:

```bash
sf cmdt generate fromorg --dev-name MyCMDT --sobject MySourceObject__c
```

Generate a custom metadata type from a custom object in an org with alias my-scratch-org; ignore unsupported field types instead of converting them to text:

```bash
sf cmdt generate fromorg --dev-name MyCMDT --sobject MySourceObject__c --ignore-unsupported --target-org my-scratch-org
```

Generate a protected custom metadata type from a custom object:

```bash
sf cmdt generate fromorg --dev-name MyCMDT --sobject MySourceObject__c --visibility Protected
```

Generate a protected custom metadata type from a custom setting with a specific singular and plural label:

```bash
sf cmdt generate fromorg --dev-name MyCMDT --label "My CMDT" --plural-label "My CMDTs" --sobject MySourceSetting__c --visibility Protected
```

Generate a custom metadata type and put the resulting metadata files in the specified directory:

```bash
sf cmdt generate fromorg --dev-name MyCMDT --sobject MySourceObject__c --type-output-directory path/to/my/cmdt/directory
```

Generate a custom metadata type and put the resulting record metadata file(s) in the specified directory:

```bash
sf cmdt generate fromorg --dev-name MyCMDT --sobject MySourceObject__c --records-output-dir path/to/my/cmdt/record/directory
```

#### Aliases

`force:cmdt:generate`

> *Plugin: @salesforce/plugin-custom-metadata*


### cmdt generate object

**Generate a new custom metadata type in the current project.**

This command creates a metadata file that describes the new custom metadata type. By default, the file is created in the MyCustomType__mdt directory in the current directory, where MyCustomType is the value of the required --type-name flag. Use the --output-directory to generate the file in a package directory with other custom metadata types, such as "force-app/main/default/objects".

#### Usage

```bash
sf cmdt generate object [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `--loglevel` | string |  |
| `-n, --type-name` | string (required) | Unique object name for the custom metadata type. |
| `-l, --label` | string | Label for the custom metadata type. |
| `-p, --plural-label` | string | Plural version of the label value; if blank, uses label. |
| `-v, --visibility` | string | Who can see the custom metadata type. |
| `-d, --output-directory` | string | Directory to store the newly-created custom metadata type files |

#### Examples

Generate a custom metadata type with developer name 'MyCustomType'; this name is also used as the label:

```bash
sf cmdt generate object --type-name MyCustomType
```

Generate a protected custom metadata type with a specific label:

```bash
sf cmdt generate object --type-name MyCustomType --label "Custom Type" --plural-label "Custom Types" --visibility Protected
```

#### Aliases

`force:cmdt:create`, `cmdt:create`

> *Plugin: @salesforce/plugin-custom-metadata*


### cmdt generate record

**Generate a new record for a given custom metadata type in the current project.**

The custom metadata type must already exist in your project. You must specify a name for the new record. Use name=value pairs to specify the values for the fields, such as MyTextField="some text here" or MyNumberField=32.

#### Usage

```bash
sf cmdt generate record [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `--loglevel` | string |  |
| `-t, --type-name` | string (required) | API name of the custom metadata type to create a record for; must end in "__mdt". |
| `-n, --record-name` | string (required) | Name of the new record. |
| `-l, --label` | string | Label for the new record. |
| `-p, --protected` | string | Protect the record when it's in a managed package. |
| `-i, --input-directory` | string | Directory from which to get the custom metadata type definition from. |
| `-d, --output-directory` | string | Directory to store newly-created custom metadata record files. |

#### Examples

Create a record metadata file for custom metadata type 'MyCMT' with specified values for two custom fields:

```bash
sf cmdt generate record --type-name MyCMT__mdt --record-name MyRecord My_Custom_Field_1=Foo My_Custom_Field_2=Bar
```

Create a protected record metadata file for custom metadata type 'MyCMT' with a specific label and values specified for two custom fields:

```bash
sf cmdt generate record --type-name MyCMT__mdt --record-name MyRecord --label "My Record" --protected true My_Custom_Field_1=Foo My_Custom_Field_2=Bar
```

#### Aliases

`force:cmdt:record:create`, `cmdt:record:create`

> *Plugin: @salesforce/plugin-custom-metadata*


### cmdt generate records

**Generate new custom metadata type records from a CSV file.**

The custom metadata type must already exist in your project. By default, the Name column is used to determine the record name; use the --name-column flag to specify a different column.

#### Usage

```bash
sf cmdt generate records [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `--loglevel` | string |  |
| `-f, --csv` | string (required) | Pathname of the CSV file. |
| `-t, --type-name` | string (required) | API name of the custom metadata type to create a record for. |
| `-i, --input-directory` | string | Directory from which to get the custom metadata type definition from. |
| `-d, --output-directory` | string | Directory to store newly-created custom metadata record files. |
| `-n, --name-column` | string | Column used to determine the name of the record. |

#### Examples

Generate record metadata files from values in a CSV file for the custom metadata type MyCmdt. Use 'Name' as the column that specifies the record name:

```bash
sf cmdt generate records --csv path/to/my.csv --type-name MyCmdt
```

Generate record metadata files from a CSV file in the directory different from the default, and use 'PrimaryKey' as the column that specifies the record name:

```bash
sf cmdt generate records --csv path/to/my.csv --type-name MyCmdt --input-directory path/to/my/cmdt/directory --name-column "PrimaryKey"
```

#### Aliases

`force:cmdt:record:insert`, `cmdt:record:insert`

> *Plugin: @salesforce/plugin-custom-metadata*


---

## code-analyzer

*3 commands in this topic*

### code-analyzer config

**Output the current state of configuration for Code Analyzer.**

Code Analyzer gives you the ability to configure settings that modify Code Analyzer's behavior, to override the tags and severity levels of rules, and to configure the engine specific settings. Use this command to see the current state of this configuration. You can also save this state to a YAML-formatted file that you can modify for your needs.

To apply a custom configuration with Code Analyzer, either keep your custom configuration settings in a `code-analyzer.yml` file located in the current folder from which you are executing commands, or specify the location of your custom configuration file to the Code Analyzer commands with the --config-file flag.

We're continually improving Salesforce Code Analyzer. Tell us what you think! Give feedback at https://sfdc.co/CodeAnalyzerFeedback.

#### Usage

```bash
sf code-analyzer config [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--flags-dir` | string | Import flag values from a directory. |
| `-w, --workspace` | string | Set of files that make up your workspace. |
| `-t, --target` | string | Subset of files within your workspace that you want to target for analysis. |
| `-r, --rule-selector` | string | Selection of rules, based on engine name, severity level, rule name, tag, or a combination of criter... |
| `-c, --config-file` | string | Path to the existing configuration file used to customize the engines and rules. |
| `-f, --output-file` | string | Output file to write the configuration state to. The file is written in YAML format. |
| `--include-unmodified-rules` | boolean | Include unmodified rules in the rule override settings. |

#### Examples

Display the current state of the Code Analyzer configuration using the default behavior: display top level configuration, display the engine and rule override settings associated with all the rules; and automatically apply any existing custom configuration settings found in a `code-analyzer.yml` or `code-analyzer.yaml` file in the current folder:

```bash
sf code-analyzer config
```

This example is identical to the previous one, assuming that `./code-analyzer.yml` exists in your current folder.

```bash
sf code-analyzer config --config-file ./code-analyzer.yml --rule-selector all
```

Write the current state of configuration to the file `code-analyzer.yml`, including any configuration from an existing `code-analyzer.yml` file. The command preserves all values from the original config, but overwrites any comments:

```bash
sf code-analyzer config --config-file ./code-analyzer.yml --output-file code-analyzer.yml
```

Display the configuration state for just the recommended rules, instead of all the rules:

```bash
sf code-analyzer config --rule-selector Recommended
```

Display all the default rule values for the recommended rules, instead of only the rule values you've explicitly overriden in your `code-analyzer.yml` file. By default, only overriden rule values are displayed unless you specify the `--include-unmodified-rules` flag:

```bash
sf code-analyzer config --rule-selector Recommended --include-unmodified-rules
```

Display the configuration state associated with all the rules that are applicable to the files targeted within the folder `./src`:

```bash
sf code-analyzer config --target ./src
```

Display any relevant configuration settings associated with the rule name 'no-undef' from the 'eslint' engine:

```bash
sf code-analyzer config --rule-selector eslint:no-undef
```

Display any relevant configuration settings associated with PMD rules whose severity is 2 or 3:

```bash
sf code-analyzer config --rule-selector "pmd:(2,3)"
```

Load an existing configuration file called `existing-config.yml`, and then write the configuration to a new file called `new-config.yml`, the configuration state that is applicable to all rules that are relevant to the workspace located in the current folder:

```bash
sf code-analyzer config --config-file ./existing-config.yml --workspace . --output-file ./subfolder-config.yml
```

> *Plugin: @salesforce/plugin-code-analyzer*


### code-analyzer rules

**List the rules that are available to analyze your code.**

You can also view details about the rules, such as the engine it's associated with, tags, and description.

Use this command to determine the exact set of rules to analyze your code. The `code-analyzer run` command has similar flags as this command, so once you've determined the flag values for this command that list the rules you want to run, you specify the same values to the `code-analyzer run` command.

We're continually improving Salesforce Code Analyzer. Tell us what you think! Give feedback at https://sfdc.co/CodeAnalyzerFeedback.

#### Usage

```bash
sf code-analyzer rules [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--flags-dir` | string | Import flag values from a directory. |
| `-w, --workspace` | string | Set of files that make up your workspace. |
| `-t, --target` | string | Subset of files within your workspace that you want to target for analysis. |
| `-r, --rule-selector` | string | Selection of rules, based on engine name, severity level, rule name, tag, or a combination of criter... |
| `-c, --config-file` | string | Path to the configuration file used to customize the engines and rules. |
| `-f, --output-file` | string | Name of the file where the selected rules are written. The file format depends on the extension you ... |
| `-v, --view` | string | Format to display the rules in the terminal. |

#### Examples

List rules using the default behavior: include rules from all engines that have a "Recommended" tag; display the rules using concise table format; and automatically apply rule or engine overrides if a `code-analyzer.yml` or `code-analyzer.yaml` file exists in the current folder:

```bash
sf code-analyzer rules
```

The previous example is equivalent to this example:

```bash
sf code-analyzer rules --rule-selector Recommended --view table --config-file ./code-analyzer.yml
```

List the recommended rules for the "eslint" engine:

```bash
sf code-analyzer rules --rule-selector eslint:Recommended
```

List all the rules for the "eslint" engine:

```bash
sf code-analyzer rules --rule-selector eslint
```

The previous example is equivalent to this example:

```bash
sf code-analyzer rules --rule-selector eslint:all
```

List the details about all rules for all engines; also write the rules in JSON format to a file called "rules.json" in the "out" folder, which must already exist:

```bash
sf code-analyzer rules --rule-selector all --output-file ./out/rules.json --view detail
```

Get a more accurate list of the rules that apply specifically to your workspace (all the files in the current folder):

```bash
sf code-analyzer rules --rule-selector all --workspace .
```

List the recommended rules associated with a workspace that targets all the files in the folder "./other-source" and only the Apex class files (extension .cls) under the folder "./force-app":

```bash
sf code-analyzer rules --rule-selector Recommended --workspace . --target ./other-source --target ./force-app/**/*.cls
```

List all the "eslint" engine rules that have a moderate severity (3) and the recommended "retire-js" engine rules with any severity:

```bash
sf code-analyzer rules --rule-selector eslint:3 --rule-selector retire-js:Recommended
```

List all the "pmd" engine rules that have a severity of moderate (3) or high (2) and the "Performance" tag.

```bash
sf code-analyzer rules --rule-selector "pmd:(2,3):Performance"
```

Similar to the previous example, but apply the rule overrides and engine settings from the configuration file called `code-analyzer2.yml` in the current folder. If, for example, you changed the severity of an "eslint" rule from moderate (3) to high (2) in the configuration file, then that rule isn't listed:

```bash
sf code-analyzer rules --rule-selector eslint:3 --rule-selector retire-js:Recommended --config-file ./code-analyzer2.yml
```

List the details of the "getter-return" rule of the "eslint" engine and the rules named "no-inner-declarations" in any engine:

```bash
sf code-analyzer rules --rule-selector eslint:getter-return --rule-selector no-inner-declarations --view detail
```

List the details of the recommended "eslint" engine rules that have the tag "problem" and high severity level (2) that apply when targeting the files within the folder "./force-app":

```bash
sf code-analyzer rules --rule-selector eslint:Recommended:problem:2 --view detail --target ./force-app
```

> *Plugin: @salesforce/plugin-code-analyzer*


### code-analyzer run

**Analyze your code with a selection of rules to ensure good coding practices.**

You can scan your codebase with the recommended rules. Or use flags to filter the rules based on engines (such as "retire-js" or "eslint"), rule names, tags, and more. 

If you want to preview the list of rules before you actually run them, use the `code-analyzer rules` command, which also has the `--config-file`, `--rule-selector`, `--target`, and `--workspace` flags that together define the list of rules to be run.

We're continually improving Salesforce Code Analyzer. Tell us what you think! Give feedback at https://sfdc.co/CodeAnalyzerFeedback.

#### Usage

```bash
sf code-analyzer run [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--flags-dir` | string | Import flag values from a directory. |
| `-w, --workspace` | string | Set of files that make up your workspace. |
| `-t, --target` | string | Subset of files within your workspace to be targeted for analysis. |
| `-r, --rule-selector` | string | Selection of rules, based on engine name, severity level, rule name, tag, or a combination of criter... |
| `-s, --severity-threshold` | string | Severity level of a found violation that must be met or exceeded to cause this command to fail with ... |
| `-v, --view` | string | Format to display the command results in the terminal. |
| `-f, --output-file` | string | Name of the file where the analysis results are written. The file format depends on the extension yo... |
| `-c, --config-file` | string | Path to the configuration file used to customize the engines and rules. |

#### Examples

Analyze code using the default behavior: analyze all the files in the current folder (default workspace) using the Recommended rules; display the output in the terminal with the concise table view; and automatically apply rule or engine overrides if a `code-analyzer.yml` or `code-analyzer.yaml` file exists in the current folder:

```bash
sf code-analyzer run
```

The previous example is equivalent to this example:

```bash
sf code-analyzer run --rule-selector Recommended --workspace . --target . --view table --config-file ./code-analyzer.yml
```

Analyze the files using the recommended "eslint" rules and show details of the violations:

```bash
sf code-analyzer run --rule-selector eslint:Recommended --view detail
```

Analyze the files using all the "eslint" rules:

```bash
sf code-analyzer run --rule-selector eslint
```

The previous example is equivalent to this example:

```bash
sf code-analyzer run --rule-selector eslint:all
```

Analyze the files using all rules for all engines:

```bash
sf code-analyzer run --rule-selector all
```

Analyze the files using only rules in the "pmd" engine with a severity of high (2) or moderate (3), and the "Performance" tag.

```bash
sf code-analyzer run --rule-selector "pmd:(2,3):Performance"
```

Analyze files using the recommended "retire-js" rules; target all the files in the folder "./other-source" and only the Apex class files (extension .cls) in the folder "./force-app":

```bash
sf code-analyzer run --rule-selector retire-js:Recommended --target ./other-source --target ./force-app/**/*.cls
```

Specify a custom configuration file and output the results to the "results.csv" file in CSV format; the commands fails if it finds a violation that exceeds the moderate severity level (3):

```bash
sf code-analyzer run --config-file ./code-analyzer2.yml --output-file results.csv --severity-threshold 3
```

Analyze the files using all the "eslint" engine rules that have a moderate severity (3) and the recommended "retire-js" engine rules with any severity:

```bash
sf code-analyzer run --rule-selector eslint:3 --rule-selector retire-js:Recommended
```

Analyze the files using only the "getter-return" rule of the "eslint" engine and any rule named "no-inner-declarations" from any engine:

```bash
sf code-analyzer run --rule-selector eslint:getter-return --rule-selector no-inner-declarations
```

> *Plugin: @salesforce/plugin-code-analyzer*


---

## commands

*1 commands in this topic*

### commands

List all sf commands.

#### Usage

```bash
sf commands [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `-c, --columns` | string | Only show provided columns (comma-separated). |
| `--deprecated` | boolean | Show deprecated commands. |
| `-x, --extended` | boolean | Show extra columns. |
| `--hidden` | boolean | Show hidden commands. |
| `--no-truncate` | boolean | Do not truncate output. |
| `--sort` | string | Property to sort by. |
| `--tree` | boolean | Show tree of commands. |

> *Plugin: @oclif/plugin-commands*


---

## community

*3 commands in this topic*

### community create

**Create an Experience Cloud site using a template.**

Run the "community list template" command to see the templates available in your org. See 'Which Experience Cloud Template Should I Use?' in Salesforce Help for more information about the different template types available. (https://help.salesforce.com/s/articleView?id=sf.siteforce_commtemp_intro.htm&type=5)

When you create a site with the Build Your Own (LWR) template, you must also specify the AuthenticationType value using the format templateParams.AuthenticationType=value, where value is AUTHENTICATED or AUTHENTICATED_WITH_PUBLIC_ACCESS_ENABLED. Name and values are case-sensitive. See 'DigitalExperienceBundle' in the Metadata API Developer Guide for more information. (https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/meta_digitalexperiencebundle.htm)

The site creation process is an async job that generates a jobId. To check the site creation status, query the BackgroundOperation object and enter the jobId as the Id. See ‘BackgroundOperation’ in the Object Reference for the Salesforce Platform for more information. (https://developer.salesforce.com/docs/atlas.en-us.object_reference.meta/object_reference/sforce_api_objects_backgroundoperation.htm)

If the job doesn’t complete within 10 minutes, it times out. You receive an error message and must restart the site creation process. Completed jobs expire after 24 hours and are removed from the database.

When you run this command, it creates the site in preview status, which means that the site isn't yet live. After you finish building your site, you can make it live.

If you have an Experience Builder site, publish the site using the "community publish" command to make it live.

If you have a Salesforce Tabs + Visualforce site, to activate the site and make it live, update the status field of the Network type in Metadata API. (https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/meta_network.htm) Alternatively, in Experience Workspaces, go to Administration | Settings, and click Activate.

For Experience Builder sites, activating the site sends a welcome email to site members.

#### Usage

```bash
sf community create [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `-n, --name` | string (required) | Name of the site to create. |
| `-t, --template-name` | string (required) | Template to use to create a site. |
| `-p, --url-path-prefix` | string | URL to append to the domain created when Digital Experiences was enabled for this org. |
| `-d, --description` | string | Description of the site. |
| `-o, --target-org` | string (required) | Username or alias of the target org. Not required if the `target-org` configuration variable is alre... |
| `--loglevel` | string |  |
| `--api-version` | string | Override the api version used for api requests made by this command |

#### Examples

Create an Experience Cloud site using template 'Customer Service' and URL path prefix 'customers':

```bash
sf community create --name 'My Customer Site' --template-name 'Customer Service' --url-path-prefix customers --description 'My customer site'
```

Create a site using 'Partner Central' template:

```bash
sf community create --name partnercentral --template-name 'Partner Central' --url-path-prefix partners
```

Create a site using the 'Build Your Own (LWR)' template with authentication type of UNAUTHENTICATED:

```bash
sf community create --name lwrsite --template-name 'Build Your Own (LWR)' --url-path-prefix lwrsite templateParams.AuthenticationType=UNAUTHENTICATED
```

#### Aliases

`force:community:create`

> *Plugin: @salesforce/plugin-community*


### community list template

**Retrieve the list of templates available in your org.**

See 'Which Experience Cloud Template Should I Use?' (https://help.salesforce.com/s/articleView?id=sf.siteforce_commtemp_intro.htm&type=5) in Salesforce Help for more information about the different template types available for Experience Cloud.

#### Usage

```bash
sf community list template [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `-o, --target-org` | string (required) | Username or alias of the target org. Not required if the `target-org` configuration variable is alre... |
| `--api-version` | string | Override the api version used for api requests made by this command |
| `--loglevel` | string |  |

#### Examples

Retrieve the template list from an org with alias my-scratch-org:

```bash
sf community list template --target-org my-scratch-org
```

#### Aliases

`force:community:template:list`

> *Plugin: @salesforce/plugin-community*


### community publish

**Publish an Experience Builder site to make it live.**

Each time you publish a site, you update the live site with the most recent updates. When you publish an Experience Builder site for the first time, you make the site's URL live and enable login access for site members.

In addition to publishing, you must activate a site to send a welcome email to all site members. Activation is also required to set up SEO for Experience Builder sites. To activate a site, update the status field of the Network type in Metadata API. (https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/meta_network.htm) Alternatively, in Experience Workspaces, go to Administration | Settings, and click Activate.

An email notification informs you when your changes are live on the published site. The site publish process is an async job that generates a jobId. To check the site publish status manually, query the BackgroundOperation object and enter the jobId as the Id. See ‘BackgroundOperation’ in the Object Reference for the Salesforce Platform for more information. (https://developer.salesforce.com/docs/atlas.en-us.object_reference.meta/object_reference/sforce_api_objects_backgroundoperation.htm)

If the job doesn’t complete within 15 minutes, it times out. You receive an error message and must restart the site publish process. Completed jobs expire after 24 hours and are removed from the database.

#### Usage

```bash
sf community publish [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `-n, --name` | string (required) | Name of the Experience Builder site to publish. |
| `-o, --target-org` | string (required) | Username or alias of the target org. Not required if the `target-org` configuration variable is alre... |
| `--api-version` | string | Override the api version used for api requests made by this command |
| `--loglevel` | string |  |

#### Examples

Publish the Experience Builder site with name "My Customer Site':

```bash
sf community publish --name 'My Customer Site'
```

#### Aliases

`force:community:publish`

> *Plugin: @salesforce/plugin-community*


---

## config

*4 commands in this topic*

### config get

**Get the value of a configuration variable.**

Run "sf config list" to see the configuration variables you've already set and their level (local or global).

Run "sf config set" to set a configuration variable. For the full list of available configuration variables, see https://developer.salesforce.com/docs/atlas.en-us.sfdx_setup.meta/sfdx_setup/sfdx_dev_cli_config_values.htm.

#### Usage

```bash
sf config get [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `--loglevel` | string |  |
| `--verbose` | boolean | Display whether the configuration variables are set locally or globally. |

#### Examples

Get the value of the "target-org" configuration variable.

```bash
sf config get target-org
```

Get multiple configuration variables and display whether they're set locally or globally:

```bash
sf config get target-org api-version --verbose
```

#### Aliases

`force:config:get`

> *Plugin: @salesforce/plugin-settings*


### config list

**List the configuration variables that you've previously set.**

A config variable can be global or local, depending on whether you used the --global flag when you set it. Local config variables apply only to the current project and override global config variables, which apply to all projects.  You can set all config variables as environment variables. Environment variables override their equivalent local and global config variables.

The output of this command takes into account your current context. For example, let's say you run this command from a Salesforce DX project in which you've locally set the "target-org" config variable. The command displays the local value, even if you've also set "target-org" globally. If you haven't set the config variable locally, then the global value is displayed, if set. If you set the SF_TARGET_ORG environment variable, it's displayed as such and overrides any locally or globally set "target-org" config variable. 

For the full list of available configuration variables, see https://developer.salesforce.com/docs/atlas.en-us.sfdx_setup.meta/sfdx_setup/sfdx_dev_cli_config_values.htm.

#### Usage

```bash
sf config list [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `--loglevel` | string |  |

#### Examples

List the global and local configuration variables that apply to your current context:

```bash
$ sf config list
```

#### Aliases

`force:config:list`

> *Plugin: @salesforce/plugin-settings*


### config set

**Set one or more configuration variables, such as your default org.**

Use configuration variables to set CLI defaults, such as your default org or the API version you want the CLI to use. For example, if you set the "target-org" configuration variable, you don't need to specify it as a "sf deploy metadata" flag if you're deploying to your default org.

Local configuration variables apply only to your current project. Global variables, specified with the --global flag, apply in any Salesforce DX project.

The resolution order if you've set a flag value in multiple ways is as follows:

    1. Flag value specified at the command line.
    2. Local (project-level) configuration variable.
    3. Global configuration variable.

Run "sf config list" to see the configuration variables you've already set and their level (local or global).

If you're setting a single config variable, you don't need to use an equal sign between the variable and value. But you must use the equal sign if setting multiple config variables.

For the full list of available configuration variables, see https://developer.salesforce.com/docs/atlas.en-us.sfdx_setup.meta/sfdx_setup/sfdx_dev_cli_config_values.htm.

#### Usage

```bash
sf config set [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `--loglevel` | string |  |
| `-g, --global` | boolean | Set the configuration variables globally, so they can be used from any Salesforce DX project. |

#### Examples

Set the local target-org configuration variable to an org username:

```bash
sf config set target-org me@my.org
```

Set the local target-org configuration variable to an alias:

```bash
sf config set target-org my-scratch-org
```

Set the global target-org and target-dev-hub configuration variables using aliases:

```bash
sf config set --global target-org=my-scratch-org target-dev-hub=my-dev-hub
```

#### Aliases

`force:config:set`

> *Plugin: @salesforce/plugin-settings*


### config unset

**Unset local or global configuration variables.**

Local configuration variables apply only to your current project. Global configuration variables apply in any Salesforce DX project.

For the full list of available configuration variables, see https://developer.salesforce.com/docs/atlas.en-us.sfdx_setup.meta/sfdx_setup/sfdx_dev_cli_config_values.htm.

#### Usage

```bash
sf config unset [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `--loglevel` | string |  |
| `-g, --global` | boolean | Unset the configuration variables globally. |

#### Examples

Unset the local "target-org" configuration variable:

```bash
sf config unset target-org
```

Unset multiple configuration variables globally:

```bash
sf config unset target-org api-version --global
```

#### Aliases

`force:config:unset`

> *Plugin: @salesforce/plugin-settings*


---

## data

*21 commands in this topic*

### data bulk results

**Get the results of a bulk ingest job that you previously ran.**

Use this command to get the complete results after running one of the CLI commands that uses Bulk API 2.0 to ingest (import, update, upsert, or delete) large datasets to your org, such as "data import bulk". The previously-run bulk command must have completed; if it's still processing, run the corresponding resume command first, such as "data import resume." Make note of the job ID of the previous bulk command because you use it to run this command. 

You can also use this command to get results from running a bulk ingest job with a different tool, such as Data Loader, as long as you have the job ID. For information on Data Loader, see https://developer.salesforce.com/docs/atlas.en-us.dataLoader.meta/dataLoader/data_loader_intro.htm. 

This command first displays the status of the previous bulk job, the operation that was executed in the org (such as insert or hard delete), and the updated Salesforce object. The command then displays how many records were processed in total, and how many were successful or failed. Finally, the output displays the names of the generated CSV-formatted files that contain the specific results for each ingested record. Depending on the success or failure of the bulk command, the results files can include the IDs of inserted records or the specific errors. When possible, if the ingest job failed or was aborted, you also get a CSV file with the unprocessed results.

#### Usage

```bash
sf data bulk results [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `-i, --job-id` | string (required) | Job ID of the bulk job. |
| `-o, --target-org` | string (required) | Username or alias of the target org. Not required if the `target-org` configuration variable is alre... |
| `--api-version` | string | Override the api version used for api requests made by this command |

#### Examples

Get results from a bulk ingest job; use the org with alias "my-scratch":

```bash
sf data bulk results --job-id 7507i000fake341G --target-org my-scratch
```

> *Plugin: @salesforce/plugin-data*


### data create file

**Upload a local file to an org.**

This command always creates a new file in the org; you can't update an existing file. After a successful upload, the command displays the ID of the new ContentDocument record which represents the uploaded file.

By default, the uploaded file isn't attached to a record; in the Salesforce UI the file shows up in the Files tab. You can optionally attach the file to an existing record, such as an account, as long as you know its record ID.

You can also give the file a new name after it's been uploaded; by default its name in the org is the same as the local file name.

#### Usage

```bash
sf data create file [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `-o, --target-org` | string (required) | Username or alias of the target org. Not required if the `target-org` configuration variable is alre... |
| `--api-version` | string | Override the api version used for api requests made by this command |
| `-t, --title` | string | New title given to the file (ContentDocument) after it's uploaded. |
| `-f, --file` | string (required) | Path of file to upload. |
| `-i, --parent-id` | string | ID of the record to attach the file to. |

#### Examples

Upload the local file "resources/astro.png" to your default org:

```bash
sf data create file --file resources/astro.png
```

Give the file a different filename after it's uploaded to the org with alias "my-scratch":

```bash
sf data create file --file resources/astro.png --title AstroOnABoat.png --target-org my-scratch
```

Attach the file to a record in the org:

```bash
sf data create file --file path/to/astro.png --parent-id a03fakeLoJWPIA3
```

> *Plugin: @salesforce/plugin-data*


### data create record

**Create and insert a record into a Salesforce or Tooling API object.**

You must specify a value for all required fields of the object.

When specifying fields, use the format <fieldName>=<value>. Enclose all field-value pairs in one set of double quotation marks, delimited by spaces. Enclose values that contain spaces in single quotes.

This command inserts a record into Salesforce objects by default. Use the --use-tooling-api flag to insert into a Tooling API object.

#### Usage

```bash
sf data create record [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `-o, --target-org` | string (required) | Username or alias of the target org. Not required if the `target-org` configuration variable is alre... |
| `--api-version` | string | Override the api version used for api requests made by this command |
| `--loglevel` | string |  |
| `-s, --sobject` | string (required) | API name of the Salesforce or Tooling API object that you're inserting a record into. |
| `-v, --values` | string (required) | Values for the flags in the form <fieldName>=<value>, separate multiple pairs with spaces. |
| `-t, --use-tooling-api` | boolean | Use Tooling API so you can insert a record in a Tooling API object. |
| `--perflog` | boolean | Get API performance data. |

#### Examples

Insert a record into the Account object of your default org; only the required Name field has a value:

```bash
sf data create record --sobject Account --values "Name=Acme"
```

Insert an Account record with values for two fields, one value contains a space; the command uses the org with alias "my-scratch":

```bash
sf data create record --sobject Account --values "Name='Universal Containers' Website=www.example.com" --target-org my-scratch
```

Insert a record into the Tooling API object TraceFlag:

```bash
sf data create record --use-tooling-api --sobject TraceFlag --values "DebugLevelId=7dl170000008U36AAE StartDate=2022-12-15T00:26:04.000+0000 ExpirationDate=2022-12-15T00:56:04.000+0000 LogType=CLASS_TRACING TracedEntityId=01p17000000R6bLAAS"
```

#### Aliases

`force:data:record:create`

> *Plugin: @salesforce/plugin-data*


### data delete bulk

**Bulk delete records from an org using a CSV file. Uses Bulk API 2.0.**

The CSV file must have only one column ("Id") and then the list of record IDs you want to delete, one ID per line.

When you execute this command, it starts a job, displays the ID, and then immediately returns control of the terminal to you by default. If you prefer to wait, set the --wait flag to the number of minutes; if it times out, the command outputs the IDs. Use the job ID to check the status of the job with the "sf data delete resume" command.

#### Usage

```bash
sf data delete bulk [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `-o, --target-org` | string (required) | Username or alias of the target org. Not required if the `target-org` configuration variable is alre... |
| `--api-version` | string | Override the api version used for api requests made by this command |
| `--loglevel` | string |  |
| `-f, --file` | string (required) | CSV file that contains the IDs of the records to update or delete. |
| `-s, --sobject` | string (required) | API name of the Salesforce object, either standard or custom, that you want to update or delete reco... |
| `-w, --wait` | string | Number of minutes to wait for the command to complete before displaying the results. |
| `--line-ending` | string | Line ending used in the CSV file. Default value on Windows is `CRLF`; on macOS and Linux it's `LF`. |
| `--hard-delete` | boolean | Mark the records as immediately eligible for deletion by your org. If you don't specify this flag, t... |

#### Examples

Bulk delete Account records from your default org using the list of IDs in the "files/delete.csv" file:

```bash
sf data delete bulk --sobject Account --file files/delete.csv
```

Bulk delete records from a custom object in an org with alias my-scratch and wait 5 minutes for the command to complete:

```bash
sf data delete bulk --sobject MyObject__c --file files/delete.csv --wait 5 --target-org my-scratch
```

> *Plugin: @salesforce/plugin-data*


### data delete record

**Deletes a single record from a Salesforce or Tooling API object.**

Specify the record you want to delete with either its ID or with a list of field-value pairs that identify the record. If your list of fields identifies more than one record, the delete fails; the error displays how many records were found.

When specifying field-value pairs, use the format <fieldName>=<value>. Enclose all field-value pairs in one set of double quotation marks, delimited by spaces. Enclose values that contain spaces in single quotes.

This command deletes a record from Salesforce objects by default. Use the --use-tooling-api flag to delete from a Tooling API object.

#### Usage

```bash
sf data delete record [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `-o, --target-org` | string (required) | Username or alias of the target org. Not required if the `target-org` configuration variable is alre... |
| `--api-version` | string | Override the api version used for api requests made by this command |
| `--loglevel` | string |  |
| `-s, --sobject` | string (required) | API name of the Salesforce or Tooling API object that you're deleting a record from. |
| `-i, --record-id` | string | ID of the record you’re deleting. |
| `-w, --where` | string | List of <fieldName>=<value> pairs that identify the record you want to delete. |
| `-t, --use-tooling-api` | boolean | Use Tooling API so you can delete a record from a Tooling API object. |
| `--perflog` | boolean | Get API performance data. |

#### Examples

Delete a record from Account with the specified (truncated) ID:

```bash
sf data delete record --sobject Account --record-id 00180XX
```

Delete a record from Account whose name equals "Acme":

```bash
sf data delete record --sobject Account --where "Name=Acme"
```

Delete a record from Account identified with two field values, one that contains a space; the command uses the org with alias "my-scratch":

```bash
sf data delete record --sobject Account --where "Name='Universal Containers' Phone='(123) 456-7890'" --target-org myscratch
```

Delete a record from the Tooling API object TraceFlag with the specified (truncated) ID:

```bash
sf data delete record --use-tooling-api --sobject TraceFlag --record-id 7tf8c
```

#### Aliases

`force:data:record:delete`

> *Plugin: @salesforce/plugin-data*


### data delete resume

**Resume a bulk delete job that you previously started. Uses Bulk API 2.0.**

The command uses the job ID returned by the "sf data delete bulk" command or the most recently-run bulk delete job.

#### Usage

```bash
sf data delete resume [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `-o, --target-org` | string | Username or alias of the target org. Not required if the "target-org" configuration variable is alre... |
| `-i, --job-id` | string | ID of the job you want to resume. |
| `--use-most-recent` | boolean | Use the ID of the most recently-run bulk job. |
| `--wait` | string | Number of minutes to wait for the command to complete before displaying the results. |
| `--api-version` | string | Override the api version used for api requests made by this command |
| `--loglevel` | string |  |

#### Examples

Resume a bulk delete job from your default org using an ID:

```bash
sf data delete resume --job-id 750xx000000005sAAA
```

Resume the most recently run bulk delete job for an org with alias my-scratch:

```bash
sf data delete resume --use-most-recent --target-org my-scratch
```

> *Plugin: @salesforce/plugin-data*


### data export bulk

**Bulk export records from an org into a file using a SOQL query. Uses Bulk API 2.0.**

You can use this command to export millions of records from an org, either to migrate data or to back it up.

Use a SOQL query to specify the fields of a standard or custom object that you want to export. Specify the SOQL query either at the command line with the --query flag or read it from a file with the --query-file flag; you can't specify both flags. The --output-file flag is required, which means you can only write the records to a file, in either CSV or JSON format.

Bulk exports can take a while, depending on how many records are returned by the SOQL query. If the command times out, the command displays the job ID. To see the status and get the results of the job, run "sf data export resume" and pass the job ID to the --job-id flag.

IMPORTANT: This command uses Bulk API 2.0, which limits the type of SOQL queries you can run. For example, you can't use aggregate functions such as count(). For the complete list of limitations, see the "SOQL Considerations" section in the "Bulk API 2.0 and Bulk API Developer Guide" (https://developer.salesforce.com/docs/atlas.en-us.api_asynch.meta/api_asynch/queries.htm).

#### Usage

```bash
sf data export bulk [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `-o, --target-org` | string (required) | Username or alias of the target org. Not required if the `target-org` configuration variable is alre... |
| `--api-version` | string | Override the api version used for api requests made by this command |
| `-w, --wait` | string | Time to wait for the command to finish, in minutes. |
| `-q, --query` | string | SOQL query to execute. |
| `--query-file` | string | File that contains the SOQL query. |
| `--all-rows` | boolean | Include records that have been soft-deleted due to a merge or delete. By default, deleted records ar... |
| `--output-file` | string (required) | File where records are written. |
| `-r, --result-format` | string (required) | Format to write the results. |
| `--column-delimiter` | string | Column delimiter to be used when writing CSV output. Default is COMMA. |
| `--line-ending` | string | Line ending to be used when writing CSV output. Default value on Windows is is `CRLF`; on macOS and ... |

#### Examples

Export the Id, Name, and Account.Name fields of the Contact object into a CSV-formatted file; if the export doesn't complete in 10 minutes, the command ends and displays a job ID. Use the org with alias "my-scratch":

```bash
sf data export bulk --query "SELECT Id, Name, Account.Name FROM Contact" --output-file export-accounts.csv --wait 10 --target-org my-scratch
```

Similar to previous example, but use the default org, export the records into a JSON-formatted file, and include records that have been soft deleted:

```bash
sf data export bulk --query "SELECT Id, Name, Account.Name FROM Contact" --output-file export-accounts.json --result-format json --wait 10 --all-rows
```

> *Plugin: @salesforce/plugin-data*


### data export resume

**Resume a bulk export job that you previously started. Uses Bulk API 2.0.**

When the original "data export bulk" command times out, it displays a job ID. To see the status and get the results of the bulk export, run this command by either passing it the job ID or using the --use-most-recent flag to specify the most recent bulk export job.

Using either `--job-id` or `--use-most-recent` will properly resolve to the correct org where the bulk job was started based on the cached data by "data export bulk".

#### Usage

```bash
sf data export resume [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `-i, --job-id` | string | Job ID of the bulk export. |
| `--use-most-recent` | boolean | Use the job ID of the bulk export job that was most recently run. |
| `--api-version` | string | Override the api version used for api requests made by this command |

#### Examples

Resume a bulk export job run by specifying a job ID:

```bash
sf data export resume --job-id 750xx000000005sAAA
```

Resume the most recently-run bulk export job:

```bash
sf data export resume --use-most-recent
```

> *Plugin: @salesforce/plugin-data*


### data export tree

**Export data from an org into one or more JSON files.**

Specify a SOQL query, either directly at the command line or read from a file, to retrieve the data you want to export. The exported data is written to JSON files in sObject tree format, which is a collection of nested, parent-child records with a single root record. Use these JSON files to import data into an org with the "sf data import tree" command.

If your SOQL query references multiple objects, the command generates a single JSON file by default. You can specify the --plan flag to generate separate JSON files for each object and a plan definition file that aggregates them. You then specify just this plan definition file when you import the data into an org.

The SOQL query can return a maximum of 2,000 records. For more information, see the REST API Developer Guide. (https://developer.salesforce.com/docs/atlas.en-us.api_rest.meta/api_rest/resources_composite_sobject_tree.htm).

#### Usage

```bash
sf data export tree [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `-o, --target-org` | string (required) | Username or alias of the target org. Not required if the `target-org` configuration variable is alre... |
| `--api-version` | string | Override the api version used for api requests made by this command |
| `--loglevel` | string |  |
| `-q, --query` | string (required) | SOQL query, or filepath of a file that contains the query, to retrieve records. |
| `-p, --plan` | boolean | Generate multiple sObject tree files and a plan definition file for aggregated import. |
| `-x, --prefix` | string | Prefix of generated files. |
| `-d, --output-dir` | string | Directory in which to generate the JSON files; default is current directory. |

#### Examples

Export records retrieved with the specified SOQL query into a single JSON file in the current directory; the command uses your default org:

```bash
sf data export tree --query "SELECT Id, Name, (SELECT Name, Address__c FROM Properties__r) FROM Broker__c"
```

Export data using a SOQL query in the "query.txt" file and generate JSON files for each object and a plan that aggregates them:

```bash
sf data export tree --query query.txt --plan
```

Prepend "export-demo" before each generated file and generate the files in the "export-out" directory; run the command on the org with alias "my-scratch":

```bash
sf data export tree --query query.txt --plan --prefix export-demo --output-dir export-out --target-org my-scratch
```

#### Aliases

`force:data:tree:export`

> *Plugin: @salesforce/plugin-data*


### data get record

**Retrieve and display a single record of a Salesforce or Tooling API object.**

Specify the record you want to retrieve with either its ID or with a list of field-value pairs that identify the record. If your list of fields identifies more than one record, the command fails; the error displays how many records were found.

When specifying field-value pairs, use the format <fieldName>=<value>. Enclose all field-value pairs in one set of double quotation marks, delimited by spaces. Enclose values that contain spaces in single quotes.

The command displays all the record's fields and their values, one field per terminal line. Fields with no values are displayed as "null".

This command retrieves a record from Salesforce objects by default. Use the --use-tooling-api flag to retrieve from a Tooling API object.

#### Usage

```bash
sf data get record [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `-o, --target-org` | string (required) | Username or alias of the target org. Not required if the `target-org` configuration variable is alre... |
| `--api-version` | string | Override the api version used for api requests made by this command |
| `--loglevel` | string |  |
| `-s, --sobject` | string (required) | API name of the Salesforce or Tooling API object that you're retrieving a record from. |
| `-i, --record-id` | string | ID of the record you’re retrieving. |
| `-w, --where` | string | List of <fieldName>=<value> pairs that identify the record you want to display. |
| `-t, --use-tooling-api` | boolean | Use Tooling API so you can retrieve a record from a Tooling API object. |
| `--perflog` | boolean | Get API performance data. |

#### Examples

Retrieve and display a record from Account with the specified (truncated) ID:

```bash
sf data get record --sobject Account --record-id 00180XX
```

Retrieve a record from Account whose name equals "Acme":

```bash
sf data get record --sobject Account --where "Name=Acme"
```

Retrieve a record from Account identified with two field values, one that contains a space; the command uses the org with alias "my-scratch":

```bash
sf data get record --sobject Account --where "Name='Universal Containers' Phone='(123) 456-7890'" --target-org myscratch
```

Retrieve a record from the Tooling API object TraceFlag with the specified (truncated) ID:

```bash
sf data get record --use-tooling-api --sobject TraceFlag --record-id 7tf8c
```

#### Aliases

`force:data:record:get`

> *Plugin: @salesforce/plugin-data*


### data import bulk

**Bulk import records into a Salesforce object from a CSV file. Uses Bulk API 2.0.**

You can use this command to import millions of records into the object from a file in comma-separated values (CSV) format.

All the records in the CSV file must be for the same Salesforce object. Specify the object with the `--sobject` flag.

Bulk imports can take a while, depending on how many records are in the CSV file. If the command times out, the command displays the job ID. To see the status and get the results of the job, run "sf data import resume" and pass the job ID to the --job-id flag.

For information and examples about how to prepare your CSV files, see "Prepare Data to Ingest" in the "Bulk API 2.0 and Bulk API Developer Guide" (https://developer.salesforce.com/docs/atlas.en-us.api_asynch.meta/api_asynch/datafiles_prepare_data.htm).

#### Usage

```bash
sf data import bulk [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `-f, --file` | string (required) | CSV file that contains the Salesforce object records you want to import. |
| `-s, --sobject` | string (required) | API name of the Salesforce object, either standard or custom, into which you're importing records. |
| `--api-version` | string | Override the api version used for api requests made by this command |
| `-w, --wait` | string | Time to wait for the command to finish, in minutes. |
| `-o, --target-org` | string (required) | Username or alias of the target org. Not required if the `target-org` configuration variable is alre... |
| `--line-ending` | string | Line ending used in the CSV file. Default value on Windows is `CRLF`; on macOS and Linux it's `LF`. |
| `--column-delimiter` | string | Column delimiter used in the CSV file. |

#### Examples

Import Account records from a CSV-formatted file into an org with alias "my-scratch"; if the import doesn't complete in 10 minutes, the command ends and displays a job ID:

```bash
sf data import bulk --file accounts.csv --sobject Account --wait 10 --target-org my-scratch
```

> *Plugin: @salesforce/plugin-data*


### data import resume

**Resume a bulk import job that you previously started. Uses Bulk API 2.0.**

When the original "sf data import bulk" command times out, it displays a job ID. To see the status and get the results of the bulk import, run this command by either passing it the job ID or using the --use-most-recent flag to specify the most recent bulk import job.

#### Usage

```bash
sf data import resume [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `--use-most-recent` | boolean | Use the job ID of the bulk import job that was most recently run. |
| `-i, --job-id` | string | Job ID of the bulk import. |
| `-w, --wait` | string | Time to wait for the command to finish, in minutes. |

#### Examples

Resume a bulk import job to your default org using an ID:

```bash
sf data import resume --job-id 750xx000000005sAAA
```

Resume the most recently run bulk import job for an org with alias my-scratch:

```bash
sf data import resume --use-most-recent --target-org my-scratch
```

> *Plugin: @salesforce/plugin-data*


### data import tree

**Import data from one or more JSON files into an org.**

The JSON files that contain the data are in sObject tree format, which is a collection of nested, parent-child records with a single root record. Use the "sf data export tree" command to generate these JSON files.

If you used the --plan flag when exporting the data to generate a plan definition file, use the --plan flag to reference the file when you import. If you're not using a plan, use the --files flag to list the files. If you specify multiple JSON files that depend on each other in a parent-child relationship, be sure you list them in the correct order.

#### Usage

```bash
sf data import tree [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `-o, --target-org` | string (required) | Username or alias of the target org. Not required if the `target-org` configuration variable is alre... |
| `--api-version` | string | Override the api version used for api requests made by this command |
| `--loglevel` | string |  |
| `-f, --files` | string | Comma-separated and in-order JSON files that contain the records, in sObject tree format, that you w... |
| `-p, --plan` | string | Plan definition file to insert multiple data files. |

#### Examples

Import the records contained in two JSON files into the org with alias "my-scratch":

```bash
sf data import tree --files Contact.json,Account.json --target-org my-scratch
```

Import records using a plan definition file into your default org:

```bash
sf data import tree --plan Account-Contact-plan.json
```

#### Aliases

`force:data:tree:import`

> *Plugin: @salesforce/plugin-data*


### data query

**Execute a SOQL query.**

Specify the SOQL query at the command line with the --query flag or read the query from a file with the --file flag.

If your query returns more than 10,000 records, prefer to use the `sf data export bulk` command instead. It runs the query using Bulk API 2.0, which has higher limits than the default API used by the command.

#### Usage

```bash
sf data query [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `-o, --target-org` | string (required) | Username or alias of the target org. Not required if the `target-org` configuration variable is alre... |
| `--api-version` | string | Override the api version used for api requests made by this command |
| `--loglevel` | string |  |
| `-q, --query` | string | SOQL query to execute. |
| `-f, --file` | string | File that contains the SOQL query. |
| `-t, --use-tooling-api` | boolean | Use Tooling API so you can run queries on Tooling API objects. |
| `--all-rows` | boolean | Include deleted records. By default, deleted records are not returned. |
| `-r, --result-format` | string | Format to display the results; the --json flag overrides this flag. |
| `--perflog` | boolean | Get API performance data. |
| `--output-file` | string | File where records are written; only CSV and JSON output formats are supported. |

#### Examples

Specify a SOQL query at the command line; the command uses your default org:

```bash
sf data query --query "SELECT Id, Name, Account.Name FROM Contact"
```

Read the SOQL query from a file called "query.txt" and write the CSV-formatted output to a file; the command uses the org with alias "my-scratch":

```bash
sf data query --file query.txt --output-file output.csv --result-format csv --target-org my-scratch
```

Use Tooling API to run a query on the ApexTrigger Tooling API object:

```bash
sf data query --query "SELECT Name FROM ApexTrigger" --use-tooling-api
```

#### Aliases

`force:data:soql:query`

> *Plugin: @salesforce/plugin-data*


### data resume

**View the status of a bulk data load job or batch.**

Run this command using the job ID or batch ID returned from the "sf data delete bulk" or "sf data upsert bulk" commands.

#### Usage

```bash
sf data resume [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `-o, --target-org` | string (required) | Username or alias of the target org. Not required if the `target-org` configuration variable is alre... |
| `--api-version` | string | Override the api version used for api requests made by this command |
| `--loglevel` | string |  |
| `-b, --batch-id` | string | ID of the batch whose status you want to view; you must also specify the job ID. |
| `-i, --job-id` | string (required) | ID of the job whose status you want to view. |

#### Examples

View the status of a bulk load job:

```bash
sf data resume --job-id 750xx000000005sAAA
```

View the status of a bulk load job and a specific batches:

```bash
sf data resume --job-id 750xx000000005sAAA --batch-id 751xx000000005nAAA
```

> *Plugin: @salesforce/plugin-data*


### data search

**Execute a SOSL text-based search query.**

Specify the SOSL query at the command line with the --query flag or read the query from a file with the --file flag.

By default, the results are written to the terminal in human-readable format. If you specify `--result-format csv`, the output is written to one or more CSV (comma-separated values) files. The file names correspond to the Salesforce objects in the results, such as Account.csv. Both `--result-format human` and `--result-format json` display only to the terminal.

#### Usage

```bash
sf data search [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `-o, --target-org` | string (required) | Username or alias of the target org. Not required if the `target-org` configuration variable is alre... |
| `--api-version` | string | Override the api version used for api requests made by this command |
| `-q, --query` | string | SOSL query to execute. |
| `-f, --file` | string | File that contains the SOSL query. |
| `-r, --result-format` | string | Format to display the results, or to write to disk if you specify "csv". |

#### Examples

Specify a SOSL query at the command line; the command uses your default org:

```bash
sf data search --query "FIND {Anna Jones} IN Name Fields RETURNING Contact (Name, Phone)"
```

Read the SOSL query from a file called "query.txt"; the command uses the org with alias "my-scratch":

```bash
sf data search --file query.txt --target-org my-scratch
```

Similar to the previous example, but write the results to one or more CSV files, depending on the Salesforce objects in the results:

```bash
sf data search --file query.txt --target-org my-scratch --result-format csv
```

> *Plugin: @salesforce/plugin-data*


### data update bulk

**Bulk update records to an org from a CSV file. Uses Bulk API 2.0.**

You can use this command to update millions of Salesforce object records based on a file in comma-separated values (CSV) format.

All the records in the CSV file must be for the same Salesforce object. Specify the object with the `--sobject` flag. The first column of every line in the CSV file must be an ID of the record you want to update. The CSV file can contain only existing records; if a record in the file doesn't currently exist in the Salesforce object, the command fails. Consider using "sf data upsert bulk" if you also want to insert new records.

Bulk updates can take a while, depending on how many records are in the CSV file. If the command times out, the command displays the job ID. To see the status and get the results of the job, run "sf data update resume" and pass the job ID to the --job-id flag.

For information and examples about how to prepare your CSV files, see "Prepare Data to Ingest" in the "Bulk API 2.0 and Bulk API Developer Guide" (https://developer.salesforce.com/docs/atlas.en-us.api_asynch.meta/api_asynch/datafiles_prepare_data.htm).

#### Usage

```bash
sf data update bulk [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `-w, --wait` | string | Time to wait for the command to finish, in minutes. |
| `-f, --file` | string (required) | CSV file that contains the Salesforce object records you want to update. |
| `-s, --sobject` | string (required) | API name of the Salesforce object, either standard or custom, which you are updating. |
| `--api-version` | string | Override the api version used for api requests made by this command |
| `-o, --target-org` | string (required) | Username or alias of the target org. Not required if the `target-org` configuration variable is alre... |
| `--line-ending` | string | Line ending used in the CSV file. Default value on Windows is `CRLF`; on macOS and Linux it's `LF`. |
| `--column-delimiter` | string | Column delimiter used in the CSV file. |

#### Examples

Update Account records from a CSV-formatted file into an org with alias "my-scratch"; if the update doesn't complete in 10 minutes, the command ends and displays a job ID:

```bash
sf data update bulk --file accounts.csv --sobject Account --wait 10 --target-org my-scratch
```

> *Plugin: @salesforce/plugin-data*


### data update record

**Updates a single record of a Salesforce or Tooling API object.**

Specify the record you want to update with either its ID or with a list of field-value pairs that identify the record. If your list of fields identifies more than one record, the update fails; the error displays how many records were found.

When using field-value pairs for both identifying the record and specifiyng the new field values, use the format <fieldName>=<value>. Enclose all field-value pairs in one set of double quotation marks, delimited by spaces. Enclose values that contain spaces in single quotes.

This command updates a record in Salesforce objects by default. Use the --use-tooling-api flag to update a Tooling API object.

#### Usage

```bash
sf data update record [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `-o, --target-org` | string (required) | Username or alias of the target org. Not required if the `target-org` configuration variable is alre... |
| `--api-version` | string | Override the api version used for api requests made by this command |
| `--loglevel` | string |  |
| `-s, --sobject` | string (required) | API name of the Salesforce or Tooling API object that contains the record you're updating. |
| `-i, --record-id` | string | ID of the record you’re updating. |
| `-w, --where` | string | List of <fieldName>=<value> pairs that identify the record you want to update. |
| `-v, --values` | string (required) | Fields that you're updating, in the format of <fieldName>=<value> pairs. |
| `-t, --use-tooling-api` | boolean | Use Tooling API so you can update a record in a Tooling API object. |
| `--perflog` | boolean | Get API performance data. |

#### Examples

Update the Name field of an Account record with the specified (truncated) ID:

```bash
sf data update record --sobject Account --record-id 001D0 --values "Name=NewAcme"
```

Update the Name field of an Account record whose current name is 'Old Acme':

```bash
sf data update record --sobject Account --where "Name='Old Acme'" --values "Name='New Acme'"
```

Update the Name and Website fields of an Account record with the specified (truncated) ID:

```bash
sf data update record --sobject Account --record-id 001D0 --values "Name='Acme III' Website=www.example.com"
```

Update the ExpirationDate field of a record of the Tooling API object TraceFlag using the specified (truncated) ID:

```bash
sf data update record -t --sobject TraceFlag --record-id 7tf170000009cUBAAY --values "ExpirationDate=2017-12-01T00:58:04.000+0000"
```

#### Aliases

`force:data:record:update`

> *Plugin: @salesforce/plugin-data*


### data update resume

**Resume a bulk update job that you previously started. Uses Bulk API 2.0.**

When the original "sf data update bulk" command times out, it displays a job ID. To see the status and get the results of the bulk update, run this command by either passing it the job ID or using the --use-most-recent flag to specify the most recent bulk update job.

Using either `--job-id` or `--use-most-recent` will properly resolve to the correct org where the bulk job was started based on the cached data by "data update bulk".

#### Usage

```bash
sf data update resume [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `--use-most-recent` | boolean | Use the job ID of the bulk update job that was most recently run. |
| `-i, --job-id` | string | Job ID of the bulk update. |
| `-w, --wait` | string | Time to wait for the command to finish, in minutes. |

#### Examples

Resume a bulk update job using a job ID:

```bash
sf data update resume --job-id 750xx000000005sAAA
```

Resume the most recently run bulk update job:

```bash
sf data update resume --use-most-recent
```

> *Plugin: @salesforce/plugin-data*


### data upsert bulk

**Bulk upsert records to an org from a CSV file. Uses Bulk API 2.0.**

An upsert refers to inserting a record into a Salesforce object if the record doesn't already exist, or updating it if it does exist.

When you execute this command, it starts a job, displays the ID, and then immediately returns control of the terminal to you by default. If you prefer to wait, set the --wait flag to the number of minutes; if it times out, the command outputs the IDs. Use the job and batch IDs to check the status of the job with the "sf data upsert resume" command.

See "Prepare CSV Files" in the Bulk API Developer Guide for details on formatting your CSV file. (https://developer.salesforce.com/docs/atlas.en-us.api_asynch.meta/api_asynch/datafiles_prepare_csv.htm)

#### Usage

```bash
sf data upsert bulk [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `-o, --target-org` | string (required) | Username or alias of the target org. Not required if the `target-org` configuration variable is alre... |
| `--api-version` | string | Override the api version used for api requests made by this command |
| `--loglevel` | string |  |
| `-f, --file` | string (required) | CSV file that contains the IDs of the records to update or delete. |
| `-s, --sobject` | string (required) | API name of the Salesforce object, either standard or custom, that you want to update or delete reco... |
| `-w, --wait` | string | Number of minutes to wait for the command to complete before displaying the results. |
| `--line-ending` | string | Line ending used in the CSV file. Default value on Windows is `CRLF`; on macOS and Linux it's `LF`. |
| `--column-delimiter` | string | Column delimiter used in the CSV file. |
| `-i, --external-id` | string (required) | Name of the external ID field, or the Id field. |

#### Examples

Bulk upsert records to the Contact object in your default org:

```bash
sf data upsert bulk --sobject Contact --file files/contacts.csv --external-id Id
```

Bulk upsert records to a custom object in an org with alias my-scratch and wait 5 minutes for the command to complete:

```bash
sf data upsert bulk --sobject MyObject__c --file files/file.csv --external-id MyField__c --wait 5 --target-org my-scratch
```

> *Plugin: @salesforce/plugin-data*


### data upsert resume

**Resume a bulk upsert job that you previously started. Uses Bulk API 2.0.**

The command uses the job ID returned from the "sf data upsert bulk" command or the most recently-run bulk upsert job.

#### Usage

```bash
sf data upsert resume [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `-o, --target-org` | string | Username or alias of the target org. Not required if the "target-org" configuration variable is alre... |
| `-i, --job-id` | string | ID of the job you want to resume. |
| `--use-most-recent` | boolean | Use the ID of the most recently-run bulk job. |
| `--wait` | string | Number of minutes to wait for the command to complete before displaying the results. |
| `--api-version` | string | Override the api version used for api requests made by this command |
| `--loglevel` | string |  |

#### Examples

Resume a bulk upsert job from your default org using an ID:

```bash
sf data upsert resume --job-id 750xx000000005sAAA
```

Resume the most recently run bulk upsert job for an org with alias my-scratch:

```bash
sf data upsert resume --use-most-recent --target-org my-scratch
```

> *Plugin: @salesforce/plugin-data*


---

## dev

*6 commands in this topic*

### dev audit messages

**Audit messages in a plugin's messages directory to locate unused messages and missing messages that have references in source code.**

#### Usage

```bash
sf dev audit messages [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `-p, --project-dir` | string | Location of the project where messages are to be audited. |
| `-m, --messages-dir` | string | Directory that contains the plugin's message files. |
| `-s, --source-dir` | string | Directory that contains the plugin's source code. |

#### Examples

Audit messages using default directories:

```bash
sf dev audit messages
```

Audit messages in the "messages" directory in the current working directory; the plugin's source directory is in "src":

```bash
sf dev audit messages --messages-dir ./messages --source-dir ./src
```

> *Plugin: @salesforce/plugin-dev*


### dev convert messages

**Convert a .json messages file into Markdown.**

Preserves the filename and the original messages file, then creates a new file with the Markdown extension and standard headers for the command and flag summaries, descriptions, and so on. After you review the new Markdown file, delete the old .json file.

#### Usage

```bash
sf dev convert messages [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `-p, --project-dir` | string | Location of the project whose messages are to be converted. |
| `-f, --file-name` | string (required) | Filename to convert. |

#### Examples

Convert the my-command.json message file into my-command.md with the standard messages headers:

```bash
sf dev convert messages --filename my-command.json
```

```bash
Similar to previous example, but specify the plugin project directory:
```

```bash
sf dev convert messages --project-dir ./path/to/plugin --filename my-command.json
```

> *Plugin: @salesforce/plugin-dev*


### dev convert script

**Convert a script file that contains deprecated sfdx-style commands to use the new sf-style commands instead.**

Important: Use this command only to get started on the sfdx->sf script migration. We don't guarantee that the new sf-style command replacements work correctly or as you expect. You must test, and probably update, the new script before putting it into production. We also don't guarantee that the JSON results are the same as before. 

This command can convert a large part of your script, but possibly not all. There are some sfdx-style commands that don't have an obvious sf-style equivalent. In this case, this command doesn't replace the sfdx-style command but instead adds a comment to remind you that you must convert it manually. See the Salesforce CLI Command Reference for migration information about each deprecated sfdx-style command: https://developer.salesforce.com/docs/atlas.en-us.sfdx_cli_reference.meta/sfdx_cli_reference/cli_reference.htm.

This command is interactive; as it scans your script, it prompts you when it finds an sfdx-style command or flag and asks if you want to convert it to the displayed suggestion. The command doesn't update the script file directly; rather, it creates a new file whose name is the original name but with "-converted" appended to it. The script replaces all instances of "sfdx" with "sf". For each prompt you answer "y" to, the command replaces the sfdx-style names with their equivalent sf-style ones. For example, "sfdx force:apex:execute --targetusername myscratch" is replaced with "sf apex run --target-org myscratch".

#### Usage

```bash
sf dev convert script [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `-s, --script` | string (required) | Filepath to the script you want to convert. |
| `--no-prompt` | boolean | Don't prompt for suggested replacements. |

#### Examples

Convert the YAML file called "myScript.yml" located in the current directory; the new file that contains the replacements is called "myScript-converted.yml":

```bash
sf dev convert script --script ./myScript.yml
```

> *Plugin: @salesforce/plugin-dev*


### dev generate command

**Generate a new sf command.**

You must run this command from within a plugin directory, such as the directory created with the "sf dev generate plugin" command.

The command generates basic source files, messages (\*.md), and test files for your new command. The Typescript files contain import statements for the minimum required Salesforce libraries, and scaffold some basic code. The new type names come from the value you passed to the --name flag.

The command updates the package.json file, so if it detects conflicts with the existing file, you're prompted whether you want to overwrite the file. There are a number of package.json updates required for a new command, so we recommend you answer "y" so the command takes care of them all. If you answer "n", you must update the package.json file manually.

#### Usage

```bash
sf dev generate command [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--flags-dir` | string | Import flag values from a directory. |
| `-n, --name` | string (required) | Name of the new command. Use colons to separate the topic and command names. |
| `--force` | boolean | Overwrite existing files. |
| `--dry-run` | boolean | Display the changes that would be made without writing them to disk. |
| `--nuts` | boolean | Generate a NUT test file for the command. |
| `--unit` | boolean | Generate a unit test file for the command. |

#### Examples

Generate the files for a new "sf my exciting command":

```bash
sf dev generate command --name my:exciting:command
```

> *Plugin: @salesforce/plugin-dev*


### dev generate flag

**Generate a flag for an existing command.**

You must run this command from within a plugin directory, such as the directory created with the "sf dev generate plugin" command.

This command is interactive. It first discovers all the commands currently implemented in the plugin, and asks you which you want to create a new flag for. It then prompts for other flag properties, such as its long name, optional short name, type, whether it's required, and so on. Long flag names must be kebab-case and not camelCase. The command doesn't let you use an existing long or short flag name. When the command completes, the Typescript file for the command is updated with the code for the new flag.

Use the --dry-run flag to review new code for the command file without actually updating it.

#### Usage

```bash
sf dev generate flag [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--flags-dir` | string | Import flag values from a directory. |
| `-d, --dry-run` | boolean | Print new flag code instead of adding it to the command file. |

#### Examples

Generate a new flag and update the command file:

```bash
sf dev generate flag
```

Don't actually update the command file, just view the generated code:

```bash
sf dev generate flag --dry-run
```

> *Plugin: @salesforce/plugin-dev*


### dev generate plugin

**Generate a new sf plugin.**

This command is interactive. You're prompted for information to populate your new plugin, such as its name, description, author, and percentage of code coverage you want. The command clones the 'salesforcecli/plugin-template-sf' GitHub repository, installs the plug-in's npm package dependencies using yarn install, and updates the package properties.

When the command completes, your new plugin contains the source, message, and test files for a sample "sf hello world" command.

#### Usage

```bash
sf dev generate plugin [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--flags-dir` | string | Import flag values from a directory. |
| `--dry-run` | boolean | Display the changes that would be made without writing them to disk. |

#### Examples

```bash
sf dev generate plugin
```

#### Aliases

`plugins:generate`

> *Plugin: @salesforce/plugin-dev*


---

## doctor

*1 commands in this topic*

### doctor

**Gather CLI configuration data and run diagnostic tests to discover and report potential problems in your environment.**

When you run the doctor command without parameters, it first displays a diagnostic overview of your environment. It then writes a detailed diagnosis to a JSON file in the current directory. Use the --outputdir to specify a different directory. To run diagnostic tests on a specific plugin, use the --plugin parameter. If the plugin isn't listening to the doctor, then you get a warning.

Use the --command parameter to run a specific command in debug mode; the doctor writes both stdout and stderr to \*.log files that you can provide to Salesforce Customer Support or attach to a GitHub issue.

Plugin providers can also implement their own doctor diagnostic tests by listening to the "sf-doctor" event and running plugin specific tests that are then included in the doctor diagnostics log.

#### Usage

```bash
sf doctor [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `-c, --command` | string | Command to run in debug mode; results are written to a log file. |
| `-p, --plugin` | string | Specific plugin on which to run diagnostics. |
| `-d, --output-dir` | string | Directory to save all created files rather than the current working directory. |
| `-i, --create-issue` | boolean | Create a new issue on our GitHub repo and attach all diagnostic results. |
| `--loglevel` | string |  |

#### Examples

Run CLI doctor diagnostics:

```bash
sf doctor
```

Run CLI doctor diagnostics and the specified command, and write the debug output to a file:

```bash
sf doctor --command "force:org:list --all"
```

Run CLI doctor diagnostics for a specific plugin:

```bash
sf doctor --plugin @salesforce/plugin-source
```

> *Plugin: @salesforce/plugin-info*


---

## flow

*2 commands in this topic*

### flow get test

**Display test results for a specific asynchronous test run.**

Provide a flow test run ID to display test results for an enqueued or completed asynchronous test run. The test run ID is displayed after running the "sf flow run test" command.

To see code coverage results, use the --code-coverage flag with --result-format. The output displays a high-level summary of the test run and the code coverage values for flow tests in your org. If you specify human-readable result format, use the --detailed-coverage flag to see detailed coverage results for each test method run.

#### Usage

```bash
sf flow get test [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `-o, --target-org` | string (required) | Username or alias of the target org. Not required if the `target-org` configuration variable is alre... |
| `--api-version` | string | Override the api version used for api requests made by this command |
| `-i, --test-run-id` | string (required) | ID of the test run. |
| `-c, --code-coverage` | boolean | Retrieve code coverage results. |
| `--detailed-coverage` | boolean | Not available for flow tests. |
| `-d, --output-dir` | string | Directory in which to store test result files. |
| `-r, --result-format` | string | Format of the test results. |
| `--concise` | boolean | Display only failed test results; works with human-readable output only. |

#### Examples

Display flow test results for your default org using a test run ID:

```bash
sf flow get test --test-run-id <test run id>
```

Similar to previous example, but output the result in JUnit format:

```bash
sf flow get test --test-run-id <test run id> --result-format junit
```

Also retrieve code coverage results and output in JSON format:

```bash
sf flow get test --test-run-id <test run id> --code-coverage --json
```

Specify a directory in which to save the test results from the org with the “me@my.org” username (rather than your default org):

```bash
sf flow get test --test-run-id <test run id> --code-coverage --output-dir <path to outputdir> --target-org me@my.org'
```

> *Plugin: @salesforce/plugin-flow*


### flow run test

**Invoke flow tests in an org.**

Specify which tests to run by using the --class-names flag followed by the names of the flows you want to test. For example, if you save a flow with the name Flow1, then use: --class-names Flow1.

To see code coverage results, use the --code-coverage flag with --result-format. The output displays a high-level summary of the test run and the code coverage values for classes in your org. If you specify human-readable result format, use the --detailed-coverage flag to see detailed coverage results for each test method run.

By default, "flow run test" runs asynchronously and immediately returns a test run ID. If you use the -–synchronous flag, you can use the --wait flag to specify the number of minutes to wait; if the tests finish in that timeframe, the command displays the results. If the tests haven't finished by the end of the wait time, the command displays a test run ID. Use the "flow get test --test-run-id" command to get the results.

To run both Flow and Apex tests together, run the "sf logic run test" CLI command, which has similar flags as this command, but expands the --tests flag to also include Apex tests.

You must have the "View All Data" org system permission to use this command. The permission is disabled by default and can be enabled only by a system administrator.

#### Usage

```bash
sf flow run test [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `-o, --target-org` | string (required) | Username or alias of the target org. Not required if the `target-org` configuration variable is alre... |
| `--api-version` | string | Override the api version used for api requests made by this command |
| `-r, --result-format` | string | Format of the test results. |
| `--concise` | boolean | Display only failed test results; works with human-readable output only. |
| `-d, --output-dir` | string | Directory in which to store test result files. |
| `-c, --code-coverage` | boolean | Retrieve code coverage results. |
| `-y, --synchronous` | boolean | Run flow tests for one flow synchronously; if not specified, tests are run asynchronously. |
| `-l, --test-level` | string | Level of tests to run; default is RunLocalTests. |
| `-n, --class-names` | string | Flow names that contain flow tests to run. |
| `-s, --suite-names` | string | Not available for flow tests. |
| `-t, --tests` | string | Flow test names to run. |

#### Examples

Run all local tests in your default org:

```bash
sf flow run test --test-level RunLocalTests
```

Run all the Flow1 and Flow2 flow tests in the org with alias “scratchOrg”:

```bash
sf flow run test --target-org scratchOrg --class-names Flow1 --class-names Flow2
```

Run specific Flow1 and Flow2 flow tests in your default org:

```bash
sf flow run test --tests Flow1.Test1 --tests Flow2.Test2 --test-level RunSpecifiedTests
```

Run all tests synchronously in your default org; the command waits to display the test results until all tests finish:

```bash
sf flow run test –synchronous
```

Run all local tests in the org with the username “me@my.org”; save the output to the specified directory:

```bash
sf flow run test --test-level RunLocalTests --output-dir /Users/susan/temp/cliOutput --target-org me@my.org
```

> *Plugin: @salesforce/plugin-flow*


---

## force

*7 commands in this topic*

### force data bulk delete

**Bulk delete records from an org using a CSV file. Uses Bulk API 1.0.**

The CSV file must have only one column ("Id") and then the list of record IDs you want to delete, one ID per line.

When you execute this command, it starts a job and one or more batches, displays their IDs, and then immediately returns control of the terminal to you by default. If you prefer to wait, set the --wait flag to the number of minutes; if it times out, the command outputs the IDs. Use the job and batch IDs to check the status of the job with the "sf force data bulk status" command. A single job can contain many batches, depending on the length of the CSV file.

#### Usage

```bash
sf force data bulk delete [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `-o, --target-org` | string (required) | Username or alias of the target org. Not required if the `target-org` configuration variable is alre... |
| `--api-version` | string | Override the api version used for api requests made by this command |
| `--loglevel` | string |  |
| `-f, --file` | string (required) | CSV file that contains the IDs of the records to delete. |
| `-s, --sobject` | string (required) | API name of the Salesforce object, either standard or custom, that you want to delete records from. |
| `-w, --wait` | string | Number of minutes to wait for the command to complete before displaying the results. |

#### Examples

Bulk delete Account records from your default org using the list of IDs in the "files/delete.csv" file:

```bash
sf force data bulk delete --sobject Account --file files/delete.csv
```

Bulk delete records from a custom object in an org with alias my-scratch and wait 5 minutes for the command to complete:

```bash
sf force data bulk delete --sobject MyObject__c --file files/delete.csv --wait 5 --target-org my-scratch
```

> *Plugin: @salesforce/plugin-data*


### force data bulk status

**View the status of a bulk data load job or batch. Uses Bulk API 1.0.**

Run this command using the job ID or batch ID returned from the "sf force data bulk delete" or "sf force data bulk upsert" commands.

#### Usage

```bash
sf force data bulk status [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `-o, --target-org` | string (required) | Username or alias of the target org. Not required if the `target-org` configuration variable is alre... |
| `--api-version` | string | Override the api version used for api requests made by this command |
| `--loglevel` | string |  |
| `-b, --batch-id` | string | ID of the batch whose status you want to view; you must also specify the job ID. |
| `-i, --job-id` | string (required) | ID of the job whose status you want to view. |

#### Examples

View the status of a bulk load job in your default org:

```bash
sf force data bulk status --job-id 750xx000000005sAAA
```

View the status of a bulk load job and a specific batches in an org with alias my-scratch:

```bash
sf force data bulk status --job-id 750xx000000005sAAA --batch-id 751xx000000005nAAA --target-org my-scratch
```

> *Plugin: @salesforce/plugin-data*


### force data bulk upsert

**Bulk upsert records to an org from a CSV file. Uses Bulk API 1.0.**

An upsert refers to inserting a record into a Salesforce object if the record doesn't already exist, or updating it if it does exist.

When you execute this command, it starts a job and one or more batches, displays their IDs, and then immediately returns control of the terminal to you by default. If you prefer to wait, set the --wait flag to the number of minutes; if it times out, the command outputs the IDs. Use the job and batch IDs to check the status of the job with the "sf force data bulk status" command. A single job can contain many batches, depending on the length of the CSV file.

See "Prepare CSV Files" in the Bulk API Developer Guide for details on formatting your CSV file. (https://developer.salesforce.com/docs/atlas.en-us.api_asynch.meta/api_asynch/datafiles_csv_preparing.htm)

By default, the job runs the batches in parallel, which we recommend. You can run jobs serially by specifying the --serial flag. But don't process data in serial mode unless you know this would otherwise result in lock timeouts and you can't reorganize your batches to avoid the locks.

#### Usage

```bash
sf force data bulk upsert [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `-o, --target-org` | string (required) | Username or alias of the target org. Not required if the `target-org` configuration variable is alre... |
| `--api-version` | string | Override the api version used for api requests made by this command |
| `--loglevel` | string |  |
| `-i, --external-id` | string (required) | Name of the external ID field, or the Id field. |
| `-f, --file` | string (required) | CSV file that contains the records to upsert. |
| `-s, --sobject` | string (required) | API name of the Salesforce object, either standard or custom, that you want to upsert records to. |
| `-w, --wait` | string | Number of minutes to wait for the command to complete before displaying the results. |
| `-r, --serial` | boolean | Run batches in serial mode. |

#### Examples

Bulk upsert records to the Contact object in your default org:

```bash
sf --sobject Contact --file files/contacts.csv --external-id Id
```

Bulk upsert records to a custom object in an org with alias my-scratch and wait 5 minutes for the command to complete:

```bash
sf force data bulk upsert --sobject MyObject__c --file files/file.csv --external-id MyField__c --wait 5 --target-org my-scratch
```

> *Plugin: @salesforce/plugin-data*


### force lightning lwc test create

creates a Lightning web component test file with boilerplate code inside a __tests__ directory.

#### Usage

```bash
sf force lightning lwc test create [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | format output as json |
| `--loglevel` | string | logging level for this command invocation |
| `-f, --filepath` | string (required) | path to Lightning web component .js file to create a test for |

#### Examples

```bash
$ sfdx force:lightning:lwc:test:create -f force-app/main/default/lwc/myButton/myButton.js
```

> *Plugin: @salesforce/sfdx-plugin-lwc-test*


### force lightning lwc test run

invokes Lightning Web Components Jest unit tests.

#### Usage

```bash
sf force lightning lwc test run [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | format output as json |
| `--loglevel` | string | logging level for this command invocation |
| `-d, --debug` | boolean | run tests in debug mode |
| `--watch` | boolean | run tests in watch mode |

#### Arguments

| Argument | Description |
|----------|-------------|
| `passthrough` |  |

#### Examples

```bash
$ sfdx force:lightning:lwc:test:run
```

```bash
$ sfdx force:lightning:lwc:test:run -w
```

> *Plugin: @salesforce/sfdx-plugin-lwc-test*


### force lightning lwc test setup

install Jest unit testing tools for Lightning Web Components.

#### Usage

```bash
sf force lightning lwc test setup [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | format output as json |
| `--loglevel` | string | logging level for this command invocation |

#### Examples

```bash
$ sfdx force:lightning:lwc:test:setup
```

> *Plugin: @salesforce/sfdx-plugin-lwc-test*


### force package push-upgrade list

**Lists the status of push upgrade requests for a given package.**

Shows the details of each request to create a push upgrade in the Dev Hub org.

All filter parameters are applied using the AND logical operator (not OR).

To get information about a specific request, run "sf package pushupgrade report" and supply the request ID.

#### Usage

```bash
sf force package push-upgrade list [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `-v, --target-dev-hub` | string (required) | Username or alias of the Dev Hub org. Not required if the `target-dev-hub` configuration variable is... |
| `--api-version` | string | Override the api version used for api requests made by this command |
| `-p, --package` | string (required) | Package ID (starts with 033) of the package that you want push upgrade information for. |
| `-l, --scheduled-last-days` | string | Number of days in the past for which to display the list of push upgrade requests that were schedule... |
| `-s, --status` | string | Status used to filter the list output Valid values are: Created, Canceled, Pending, In Progress, Fai... |
| `--show-push-migrations-only` | boolean | Display only push upgrade requests for package migrations. |

#### Examples

List all package push upgrade requests in the specified Dev Hub org:

```bash
sf force package push-upgrade list --package 033xyz --target-dev-hub myHub
```

List all package push upgrade requests in the specified Dev Hub org scheduled in the last 30 days:

```bash
sf force package push-upgrade list --package 033xyz --scheduled-last-days 30 --target-dev-hub myHub
```

List all package push upgrade with a status Succeeded:

```bash
sf force package push-upgrade list --package 033xyz –-status Succeeded
```

List all package push upgrade with a status Failed:

```bash
sf force package push-upgrade list --package 033xyz –-status Failed
```

#### Aliases

`force:package:push-upgrade:list`

> *Plugin: @salesforce/plugin-packaging*


---

## help

*1 commands in this topic*

### help

Display help for sf.

#### Usage

```bash
sf help [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `-n, --nested-commands` | boolean | Include all nested commands in the output. |

#### Arguments

| Argument | Description |
|----------|-------------|
| `command` | Command to show help for. |

> *Plugin: @oclif/plugin-help*


---

## info

*1 commands in this topic*

### info releasenotes display

**Display Salesforce CLI release notes on the command line.**

By default, this command displays release notes for the currently installed CLI version on your computer. Use the --version flag to view release notes for a different release.

#### Usage

```bash
sf info releasenotes display [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `-v, --version` | string | CLI version or tag for which to display release notes. |
| `--hook` | boolean | This hidden parameter is used in post install or update hooks. |
| `--loglevel` | string |  |

#### Examples

Display release notes for the currently installed CLI version:

```bash
sf info releasenotes display
```

Display release notes for CLI version 7.120.0:

```bash
sf info releasenotes display --version 7.120.0
```

Display release notes for the CLI version that corresponds to a tag (stable, stable-rc, latest, latest-rc, rc):

```bash
sf info releasenotes display --version latest
```

#### Aliases

`whatsnew`

> *Plugin: @salesforce/plugin-info*


---

## lightning

*5 commands in this topic*

### lightning generate app

**Generate a Lightning App.**

Generates a Lightning App bundle in the specified directory or the current working directory. The bundle consists of multiple files in a folder with the designated name.

#### Usage

```bash
sf lightning generate app [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `-n, --name` | string (required) | Name of the generated Lightning App. |
| `-t, --template` | string | Template to use for file creation. |
| `-d, --output-dir` | string | Directory for saving the created files. |
| `--api-version` | string | Override the api version used for api requests made by this command |
| `-i, --internal` | boolean | Generate lightning bundles without creating a -meta.xml file. |
| `--loglevel` | string |  |

#### Examples

Generate the metadata files for a Lightning app bundle called "myapp" in the current directory:

```bash
sf lightning generate app --name myapp
```

Similar to the previous example, but generate the files in the "force-app/main/default/aura" directory:

```bash
sf lightning generate app --name myapp --output-dir force-app/main/default/aura
```

#### Aliases

`force:lightning:app:create`

> *Plugin: @salesforce/plugin-templates*


### lightning generate component

**Generate a bundle for an Aura component or a Lightning web component.**

Generates the bundle in the specified directory or the current working directory. The bundle consists of multiple files in a directory with the designated name. Lightning web components are contained in the directory with name "lwc", Aura components in "aura".

To generate a Lightning web component, pass "--type lwc" to the command. If you don’t specify --type, Salesforce CLI generates an Aura component by default.

#### Usage

```bash
sf lightning generate component [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `-n, --name` | string (required) | Name of the generated Lightning Component. |
| `-t, --template` | string | Template to use for file creation. |
| `-d, --output-dir` | string | Directory for saving the created files. |
| `--api-version` | string | Override the api version used for api requests made by this command |
| `--type` | string | Type of the component bundle. |
| `-i, --internal` | boolean | Generate lightning bundles without creating a -meta.xml file. |
| `--loglevel` | string |  |

#### Examples

Generate the metadata files for an Aura component bundle in the current directory:

```bash
sf lightning generate component --name mycomponent
```

Generate a Lightning web component bundle in the current directory:

```bash
sf lightning generate component --name mycomponent --type lwc
```

Generate an Aura component bundle in the "force-app/main/default/aura" directory:

```bash
sf lightning generate component --name mycomponent --output-dir force-app/main/default/aura
```

Generate a Lightning web component bundle in the "force-app/main/default/lwc" directory:

```bash
sf lightning generate component --name mycomponent --type lwc --output-dir force-app/main/default/lwc
```

#### Aliases

`force:lightning:component:create`

> *Plugin: @salesforce/plugin-templates*


### lightning generate event

**Generate a Lightning Event.**

Generates a Lightning Event bundle in the specified directory or the current working directory. The bundle consists of multiple files in a folder with the designated name.

#### Usage

```bash
sf lightning generate event [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `-n, --name` | string (required) | Name of the generated Lightning Event. |
| `-t, --template` | string | Template to use for file creation. |
| `-d, --output-dir` | string | Directory for saving the created files. |
| `--api-version` | string | Override the api version used for api requests made by this command |
| `-i, --internal` | boolean | Generate lightning bundles without creating a -meta.xml file. |
| `--loglevel` | string |  |

#### Examples

Generate the metadata files for a Lightning event bundle called "myevent" in the current directory:

```bash
sf lightning generate event --name myevent
```

Similar to previous example, but generate the files in the "force-app/main/default/aura" directory:

```bash
sf lightning generate event --name myevent --output-dir force-app/main/default/aura
```

#### Aliases

`force:lightning:event:create`

> *Plugin: @salesforce/plugin-templates*


### lightning generate interface

**Generate a Lightning Interface.**

Generates a Lightning Interface bundle in the specified directory or the current working directory. The bundle consists of multiple files in a folder with the designated name.

#### Usage

```bash
sf lightning generate interface [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `-n, --name` | string (required) | Name of the generated Lightning Interface. |
| `-t, --template` | string | Template to use for file creation. |
| `-d, --output-dir` | string | Directory for saving the created files. |
| `--api-version` | string | Override the api version used for api requests made by this command |
| `-i, --internal` | boolean | Generate lightning bundles without creating a -meta.xml file. |
| `--loglevel` | string |  |

#### Examples

Generate the metadata files for a Lightning interface bundle called "myinterface" in the current directory:

```bash
sf lightning generate interface --name myinterface
```

Similar to the previous example but generate the files in the "force-app/main/default/aura" directory:

```bash
sf lightning generate interface --name myinterface --output-dir force-app/main/default/aura
```

#### Aliases

`force:lightning:interface:create`

> *Plugin: @salesforce/plugin-templates*


### lightning generate test

**Generate a Lightning test.**

Generates the test in the specified directory or the current working directory. The .resource file and associated metadata file are generated.

#### Usage

```bash
sf lightning generate test [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `-n, --name` | string (required) | Name of the generated Lightning Test. |
| `-t, --template` | string | Template to use for file creation. |
| `-d, --output-dir` | string | Directory for saving the created files. |
| `-i, --internal` | boolean | Generate lightning bundles without creating a -meta.xml file. |
| `--api-version` | string | Override the api version used for api requests made by this command |
| `--loglevel` | string |  |

#### Examples

Generate the metadata files for the Lightning test called MyLightningTest in the current directory:

```bash
sf lightning generate test --name MyLightningTest
```

Similar to the previous example but generate the files in the "force-app/main/default/lightningTests" directory:

```bash
sf lightning generate test --name MyLightningTest --output-dir force-app/main/default/lightningTests
```

#### Aliases

`force:lightning:test:create`

> *Plugin: @salesforce/plugin-templates*


---

## logic

*2 commands in this topic*

### logic get test

**Get the results of a test run.**

When you run 'sf logic run test' to test Apex classes and Flows asynchronously, it returns a test run ID. Use that ID with this command to see the results.

To see code coverage results, use the --code-coverage flag with --result-format. The output displays a high-level summary of the test run and the code coverage values for classes in your org. If you specify human-readable result format, use the --detailed-coverage flag to see detailed coverage results for each test method run.

#### Usage

```bash
sf logic get test [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `-o, --target-org` | string (required) | Username or alias of the target org. Not required if the `target-org` configuration variable is alre... |
| `--api-version` | string | Override the api version used for api requests made by this command |
| `--loglevel` | string |  |
| `-i, --test-run-id` | string (required) | ID of the test run. |
| `-c, --code-coverage` | boolean | Retrieve code coverage results. |
| `--detailed-coverage` | boolean | Display detailed code coverage per test. |
| `-d, --output-dir` | string | Directory in which to store test result files. |
| `-r, --result-format` | string | Format of the test results. |
| `--concise` | boolean | Display only failed test results; works with human-readable output only. |

#### Examples

Get the results for a specific test run ID in the default human-readable format; uses your default org:

```bash
sf logic get test --test-run-id <test run id>
```

Get the results for a specific test run ID, format them as JUnit, and save them to the "test-results/junit" directory; uses the org with alias "my-scratch":

```bash
sf logic get test --test-run-id <test run id> --result-format junit --target-org my-scratch
```

> *Plugin: @salesforce/plugin-apex*


### logic run test

**Invoke tests for Apex and Flows in an org.**

This command provides a single and unified way to run tests for multiple Salesforce features, such as Apex classes and Flows. Running the tests together with a single command ensures seamless interoperability between the features.

By default, the command executes asynchronously and returns a test run ID. Then use the "sf logic get test" command to retrieve the results. If you want to wait for the test run to complete and see the results in the command output, use the --synchronous flag.

To run specific tests, use the --tests flag and pass it the names of Apex and Flow tests. For Apex, simply specify the name of the Apex test class. For Flows, use the format "FlowTesting.<name-of-flow-test>". To find the name of all the flow tests in your org, run this command and specify the Flow category, such as "sf logic run test --synchronous --test-category Flow --test-level RunAllTestsInOrg". The command displays a table of all the flow tests it ran; see the "TEST NAME" column for the full name of all available flow tests in your org.

You can also run specific test methods, although if you run the tests synchronously, the methods must belong to a single Apex class or Flow test. To run all tests of a certain category, use --test-category and --test-level together. If neither of these flags is specified, all local tests for all categories are run by default. You can also use the --class-names and --suite-names flags to run Apex test classes or suites.

To see code coverage results, use the --code-coverage flag with --result-format. The output displays a high-level summary of the test run and the code coverage values for the tested classes or flows. If you specify human-readable result format, use the --detailed-coverage flag to see detailed coverage results for each test method run.

You must have the "View All Data" org system permission to use this command. The permission is disabled by default and can be enabled only by a system administrator.

#### Usage

```bash
sf logic run test [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `-o, --target-org` | string (required) | Username or alias of the target org. Not required if the `target-org` configuration variable is alre... |
| `--api-version` | string | Override the api version used for api requests made by this command |
| `--loglevel` | string |  |
| `-c, --code-coverage` | boolean | Retrieve code coverage results. |
| `-d, --output-dir` | string | Directory in which to store test run files. |
| `-l, --test-level` | string | Level of tests to run; default is RunLocalTests. |
| `-n, --class-names` | string | Apex test class names to run; default is all classes. |
| `-r, --result-format` | string | Format of the test results. |
| `-s, --suite-names` | string | Apex test suite names to run. |
| `-t, --tests` | string | Comma-separated list of test names to run. Can include Apex test classes and Flow tests. |
| `-w, --wait` | string | Sets the streaming client socket timeout in minutes; specify a longer wait time if timeouts occur fr... |
| `-y, --synchronous` | boolean | Runs test methods from a single Apex class synchronously; if not specified, tests are run asynchrono... |
| `-v, --detailed-coverage` | boolean | Display detailed code coverage per test. |
| `--concise` | boolean | Display only failed test results; works with human-readable output only. |
| `--test-category` | string | Category of tests to run, such as Apex or Flow. |

#### Examples

Run a mix of specific Apex and Flow tests asynchronously in your default org:

```bash
sf logic run test --tests MyApexClassTest,FlowTesting.Modify_Account_Desc.Modify_Account_Desc_TestAccountDescription
```

Run all local Apex and Flow tests and wait for the results to complete; run the tests in the org with alias "my-scratch":

```bash
sf logic run test --test-level RunLocalTests --test-category Apex --test-category Flow --synchronous --target-org my-scratch
```

Run two methods in an Apex test class and an Apex test suite:

```bash
sf logic run test --class-names MyApexClassTest.methodA --class-names MyApexClassTest.methodB --suite-names MySuite
```

Run all local tests for all categories (the default behavior), save the JUnit results to the "test-results" directory, and include code coverage results:

```bash
sf logic run test --result-format junit --output-dir test-results --synchronous --code-coverage
```

> *Plugin: @salesforce/plugin-apex*


---

## org

*36 commands in this topic*

### org assign permset

**Assign a permission set to one or more org users.**

To specify an alias for the --target-org or --on-behalf-of flags, use the CLI username alias, such as the one you set with the "alias set" command. Don't use the value of the Alias field of the User Salesforce object for the org user.

To assign multiple permission sets, either set multiple --name flags or a single --name flag with multiple names separated by spaces. Enclose names that contain spaces in one set of double quotes. The same syntax applies to --on-behalf-of.

#### Usage

```bash
sf org assign permset [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `-n, --name` | string (required) | Permission set to assign. |
| `-b, --on-behalf-of` | string | Username or alias to assign the permission set to. |
| `-o, --target-org` | string (required) | Username or alias of the target org. Not required if the `target-org` configuration variable is alre... |
| `--api-version` | string | Override the api version used for api requests made by this command |

#### Examples

Assign two permission sets called DreamHouse and CloudHouse to original admin user of your default org:

```bash
sf org assign permset --name DreamHouse --name CloudHouse
```

Assign the Dreamhouse permission set to the original admin user of the org with alias "my-scratch":

```bash
sf org assign permset --name DreamHouse --target-org my-scratch
```

Assign the Dreamhouse permission set to the specified list of users of your default org:

```bash
sf org assign permset --name DreamHouse --on-behalf-of user1@my.org --on-behalf-of user2 --on-behalf-of user
```

> *Plugin: @salesforce/plugin-user*


### org assign permsetlicense

**Assign a permission set license to one or more org users.**

To specify an alias for the --target-org or --on-behalf-of flags, use the CLI username alias, such as the one you set with the "alias set" command. Don't use the value of the Alias field of the User Salesforce object for the org user.

To assign multiple permission sets, either set multiple --name flags or a single --name flag with multiple names separated by spaces. Enclose names that contain spaces in one set of double quotes. The same syntax applies to --on-behalf-of.

#### Usage

```bash
sf org assign permsetlicense [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `-n, --name` | string (required) | Name of the permission set license to assign. |
| `-b, --on-behalf-of` | string | Usernames or alias to assign the permission set license to. |
| `-o, --target-org` | string (required) | Username or alias of the target org. Not required if the `target-org` configuration variable is alre... |
| `--api-version` | string | Override the api version used for api requests made by this command |

#### Examples

Assign the DreamHouse permission set license to original admin user of your default org:

```bash
sf org assign permsetlicense --name DreamHouse
```

Assign two permission set licenses to the original admin user of the org with alias "my-scratch":

```bash
sf org assign permsetlicense --name DreamHouse --name CloudHouse --target-org my-scratch
```

Assign the Dreamhouse permission set license to the specified list of users of your default org:

```bash
sf org assign permsetlicense --name DreamHouse --on-behalf-of user1@my.org --on-behalf-of user2 --on-behalf-of user3
```

> *Plugin: @salesforce/plugin-user*


### org create sandbox

**Create a sandbox org.**

There are two ways to create a sandbox org: specify a definition file that contains the sandbox options or use the --name and --license-type flags to specify the two required options. If you want to set an option other than name or license type, such as apexClassId, you must use a definition file.

You can also use this command to clone an existing sandbox. Use the --source-sandbox-name flag to specify the existing sandbox name and the --name flag to the name of the new sandbox.

#### Usage

```bash
sf org create sandbox [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `-f, --definition-file` | string | Path to a sandbox definition file. |
| `-s, --set-default` | boolean | Set the sandbox org as your default org. |
| `-a, --alias` | string | Alias for the sandbox org. |
| `-w, --wait` | string | Number of minutes to wait for the sandbox org to be ready. |
| `-i, --poll-interval` | string | Number of seconds to wait between retries. |
| `--async` | boolean | Request the sandbox creation, but don't wait for it to complete. |
| `-n, --name` | string | Name of the sandbox org. |
| `--source-sandbox-name` | string | Name of the sandbox org to clone. |
| `--source-id` | string | ID of the sandbox org to clone. |
| `-l, --license-type` | string | Type of sandbox license. |
| `-o, --target-org` | string (required) | Username or alias of the production org that contains the sandbox license. |
| `--no-prompt` | boolean | Don't prompt for confirmation about the sandbox configuration. |
| `--no-track-source` | boolean | Do not use source tracking for this sandbox. |

#### Examples

Create a sandbox org using a definition file and give it the alias "MyDevSandbox". The production org that contains the sandbox license has the alias "prodOrg".

```bash
sf org create sandbox --definition-file config/dev-sandbox-def.json --alias MyDevSandbox --target-org prodOrg
```

Create a sandbox org by directly specifying its name and type of license (Developer) instead of using a definition file. Set the sandbox org as your default.

```bash
sf org create sandbox --name mysandbox --license-type Developer --alias MyDevSandbox --target-org prodOrg --set-default
```

Clone the existing sandbox with name "ExistingSandbox" and name the new sandbox "NewClonedSandbox". Set the new sandbox as your default org. Wait for 30 minutes for the sandbox creation to complete.

```bash
sf org create sandbox --source-sandbox-name ExistingSandbox --name NewClonedSandbox --target-org prodOrg --alias MyDevSandbox --set-default --wait 30
```

Clone the existing sandbox with ID "0GQB0000000TVobOAG" and do not wait.

```bash
sf org create sandbox --source-id 0GQB0000000TVobOAG --name SbxClone --target-org prodOrg --async
```

#### Aliases

`env:create:sandbox`

> *Plugin: @salesforce/plugin-org*


### org create scratch

**Create a scratch org.**

There are four ways to create a scratch org:

    * Specify a definition file that contains the scratch org options.
    * Use the --edition flag to specify the one required option; this method doesn't require a defintion file.
    * Use the --snapshot flag to create a scratch org from a snapshot. Snapshots are a point-in-time copy of a scratch org; you create a snapshot with the "sf org create snapshot" command.
    * Use the --source-org flag to create a scratch org from an org shape. Org shapes mimic the baseline setup of a source org without the extraneous data and metadata; you create an org shape with the "sf org create shape" command.

The --edition, --snapshot, and --source-org flags are mutually exclusive, which means if you specify one, you can't also specify the others.

For any of the methods, you can also use these flags; if you use them with --definition-file, they override their equivalent option in the scratch org definition file:

    * --description
    * --name  (equivalent to the "orgName" option)
    * --username
    * --release
    * --admin-email (equivalent to the "adminEmail" option)

If you want to set options such as org features or settings, you must use a definition file.

You must specify a Dev Hub to create a scratch org, either with the --target-dev-hub flag or by setting your default Dev Hub with the target-dev-hub configuration variable.

#### Usage

```bash
sf org create scratch [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `-a, --alias` | string | Alias for the scratch org. |
| `--async` | boolean | Request the org, but don't wait for it to complete. |
| `-d, --set-default` | boolean | Set the scratch org as your default org |
| `-f, --definition-file` | string | Path to a scratch org definition file. |
| `-v, --target-dev-hub` | string (required) | Username or alias of the Dev Hub org. |
| `-c, --no-ancestors` | boolean | Don't include second-generation managed package (2GP) ancestors in the scratch org. |
| `-e, --edition` | string | Salesforce edition of the scratch org. Overrides the value of the "edition" option in the definition... |
| `-s, --snapshot` | string | Name of the snapshot to use when creating this scratch org. Overrides the value of the "snapshot" op... |
| `-m, --no-namespace` | boolean | Create the scratch org with no namespace, even if the Dev Hub has a namespace. |
| `-y, --duration-days` | string | Number of days before the org expires. |
| `-w, --wait` | string | Number of minutes to wait for the scratch org to be ready. |
| `--api-version` | string | Override the api version used for api requests made by this command |
| `-i, --client-id` | string | Consumer key of the Dev Hub connected app. |
| `-t, --track-source` | boolean | Use source tracking for this scratch org. Set --no-track-source to disable source tracking. |
| `--username` | string | Username of the scratch org admin user. Overrides the value of the "username" option in the definiti... |
| `--description` | string | Description of the scratch org in the Dev Hub. Overrides the value of the "description" option in th... |
| `--name` | string | Name of the org, such as "Acme Company". Overrides the value of the "orgName" option in the definiti... |
| `--release` | string | Release of the scratch org as compared to the Dev Hub release. |
| `--admin-email` | string | Email address that will be applied to the org's admin user. Overrides the value of the "adminEmail" ... |
| `--source-org` | string | 15-character ID of the org shape that the new scratch org is based on. Overrides the value of the "s... |

#### Examples

Create a Developer edition scratch org using your default Dev Hub and give the scratch org an alias:

```bash
sf org create scratch --edition developer --alias my-scratch-org
```

Create a scratch org with a definition file. Specify the Dev Hub using its alias, set the scratch org as your default, and specify that it expires in 3 days:

```bash
sf org create scratch --target-dev-hub MyHub --definition-file config/project-scratch-def.json --set-default --duration-days 3
```

Create a preview Enterprise edition scratch org; for use only during Salesforce release transition periods:

```bash
sf org create scratch --edition enterprise --alias my-scratch-org --target-dev-hub MyHub --release preview
```

Create a scratch org from a snapshot called "NightlyBranch"; be sure you specify the same Dev Hub org associated with the snapshot. We recommend you increase the --wait time because creating a scratch org from a snapshot can take a while:

```bash
sf org create scratch --alias my-scratch-org --target-dev-hub MyHub --snapshot NightlyBranch --wait 10
```

#### Aliases

`env:create:scratch`

> *Plugin: @salesforce/plugin-org*


### org create shape

**Create a scratch org configuration (shape) based on the specified source org.**

Scratch org shapes mimic the baseline setup (features, limits, edition, and Metadata API settings) of a source org without the extraneous data and metadata.

Run "sf org list shape" to view the available org shapes and their IDs.

To create a scratch org from an org shape, include the "sourceOrg" property in the scratch org definition file and set it to the org ID of the source org. Then create a scratch org with the "sf org create scratch" command.

#### Usage

```bash
sf org create shape [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `-o, --target-org` | string (required) | Username or alias of the target org. Not required if the `target-org` configuration variable is alre... |
| `--api-version` | string | Override the api version used for api requests made by this command |
| `--loglevel` | string |  |

#### Examples

Create an org shape for the source org with alias SourceOrg:

```bash
sf org create shape --target-org SourceOrg
```

#### Aliases

`force:org:shape:create`

> *Plugin: @salesforce/plugin-signups*


### org create snapshot

**Create a snapshot of a scratch org.**

A snapshot is a point-in-time copy of a scratch org. The copy is referenced by its unique name in a scratch org definition file.

Use "sf org get snapshot" to get details, including status, about a snapshot creation request.

To create a scratch org from a snapshot, include the "snapshot" option (instead of "edition") in the scratch org definition file and set it to the name of the snapshot. Then use "sf org create scratch" to create the scratch org.

#### Usage

```bash
sf org create snapshot [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `-v, --target-dev-hub` | string (required) | Username or alias of the Dev Hub org. Not required if the `target-dev-hub` configuration variable is... |
| `--api-version` | string | Override the api version used for api requests made by this command |
| `--loglevel` | string |  |
| `-o, --source-org` | string (required) | ID or locally authenticated username or alias of scratch org to snapshot. |
| `-n, --name` | string (required) | Unique name of snapshot. |
| `-d, --description` | string | Description of snapshot. |

#### Examples

Create a snapshot called "Dependencies" using the source scratch org ID and your default Dev Hub org:

```bash
sf org create snapshot --source-org 00Dxx0000000000 --name Dependencies --description 'Contains PackageA v1.1.0'
```

Create a snapshot called "NightlyBranch" using the source scratch org username and a Dev Hub org with alias NightlyDevHub:

```bash
sf org create snapshot --source-org myuser@myorg --name NightlyBranch --description 'Contains PkgA v2.1.0 and PkgB 3.3.0' --target-dev-hub NightlyDevHub
```

#### Aliases

`force:org:snapshot:create`

> *Plugin: @salesforce/plugin-signups*


### org create user

**Create a user for a scratch org.**

A scratch org includes one administrator user by default. For testing purposes, however, you sometimes need to create additional users.

The easiest way to create a user is to let this command assign default or generated characteristics to the new user. If you want to customize your new user, create a definition file and specify it with the --definition-file flag. In the file, you can include all the User sObject (SSalesforce object) fields and Salesforce DX-specific options, as described in "User Definition File for Customizing a Scratch Org User" (https://developer.salesforce.com/docs/atlas.en-us.sfdx_dev.meta/sfdx_dev/sfdx_dev_scratch_orgs_users_def_file.htm). You can also specify these options on the command line.

If you don't customize your new user, this command creates a user with the following default characteristics:

    * The username is the existing administrator’s username prepended with a timestamp, such as 1505759162830_test-wvkpnfm5z113@example.com.
    * The user’s profile is Standard User.
    * The values of the required fields of the User sObject are the corresponding values of the administrator user.
    * The user has no password.

Use the --set-alias flag to assign a simple name to the user that you can reference in later CLI commands. This alias is local and different from the Alias field of the User sObject record of the new user, which you set in the Setup UI.

When this command completes, it displays the new username and user ID. Run the "org display user" command to get more information about the new user.

After the new user has been created, Salesforce CLI automatically authenticates it to the scratch org so the new user can immediately start using the scratch org. The CLI uses the same authentication method that was used on the associated Dev Hub org. Due to Hyperforce limitations, the scratch org user creation fails if the Dev Hub authentication used the JWT flow and the scratch org is on Hyperforce. For this reason, if you plan to create scratch org users, authenticate to the Dev Hub org with either the "org login web" or "org login sfdx-url" command, and not "org login jwt".

For more information about user limits, defaults, and other considerations when creating a new scratch org user, see https://developer.salesforce.com/docs/atlas.en-us.sfdx_dev.meta/sfdx_dev/sfdx_dev_scratch_orgs_users.htm.

#### Usage

```bash
sf org create user [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `-a, --set-alias` | string | Set an alias for the created username to reference in other CLI commands. |
| `-f, --definition-file` | string | File path to a user definition file for customizing the new user. |
| `-s, --set-unique-username` | boolean | Force the username, if specified in the definition file or at the command line, to be unique by appe... |
| `-o, --target-org` | string (required) | Username or alias of the target org. Not required if the `target-org` configuration variable is alre... |
| `--api-version` | string | Override the api version used for api requests made by this command |
| `--loglevel` | string |  |

#### Examples

Create a user for your default scratch org and let this command generate a username, user ID, and other characteristics:

```bash
sf org create user
```

Create a user with alias "testuser1" using a user definition file. Set the "profileName" option to "Chatter Free User", which overrides the value in the defintion file if it also exists there. Create the user for the scratch org with alias "my-scratch":

```bash
sf org create user --set-alias testuser1 --definition-file config/project-user-def.json profileName='Chatter Free User' --target-org my-scratch
```

Create a user by specifying the username, email, and perm set assignment at the command line; command fails if the username already exists in Salesforce:

```bash
sf org create user username=testuser1@my.org email=me@my.org permsets=DreamHouse
```

Create a user with a definition file, set the email value as specified (overriding any value in the definition file), and generate a password for the user. If the username in the definition file isn't unique, the command appends the org ID to make it unique:

```bash
sf org create user --definition-file config/project-user-def.json email=me@my.org generatepassword=true --set-unique-username
```

#### Aliases

`force:user:create`

> *Plugin: @salesforce/plugin-user*


### org delete sandbox

**Delete a sandbox.**

Salesforce CLI marks the org for deletion in the production org that contains the sandbox licenses and then deletes all local references to the org from your computer.
Specify a sandbox with either the username you used when you logged into it, or the alias you gave the sandbox when you created it. Run "sf org list" to view all your orgs, including sandboxes, and their aliases.
Both the sandbox and the associated production org must already be authenticated with the CLI to successfully delete the sandbox.

#### Usage

```bash
sf org delete sandbox [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `-o, --target-org` | string (required) | Username or alias of the target org. Not required if the `target-org` configuration variable is alre... |
| `-p, --no-prompt` | boolean | Don't prompt the user to confirm the deletion. |

#### Examples

Delete a sandbox with alias my-sandbox:

```bash
sf org delete sandbox --target-org my-sandbox
```

Specify a username instead of an alias:

```bash
sf org delete sandbox --target-org myusername@example.com.qa
```

Delete the sandbox without prompting to confirm:

```bash
sf org delete sandbox --target-org my-sandbox --no-prompt
```

#### Aliases

`env:delete:sandbox`

> *Plugin: @salesforce/plugin-org*


### org delete scratch

**Delete a scratch org.**

Salesforce CLI marks the org for deletion in the Dev Hub org and then deletes all local references to the org from your computer.
Specify a scratch org with either the username or the alias you gave the scratch org when you created it. Run "sf org list" to view all your orgs, including scratch orgs, and their aliases.

#### Usage

```bash
sf org delete scratch [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `-o, --target-org` | string (required) | Username or alias of the target org. Not required if the `target-org` configuration variable is alre... |
| `-p, --no-prompt` | boolean | Don't prompt the user to confirm the deletion. |

#### Examples

Delete a scratch org with alias my-scratch-org:

```bash
sf org delete scratch --target-org my-scratch-org
```

Specify a username instead of an alias:

```bash
sf org delete scratch --target-org test-123456-abcdefg@example.com
```

Delete the scratch org without prompting to confirm :

```bash
sf org delete scratch --target-org my-scratch-org --no-prompt
```

#### Aliases

`env:delete:scratch`

> *Plugin: @salesforce/plugin-org*


### org delete shape

**Delete all org shapes for a target org.**

A source org can have only one active org shape. If you try to create an org shape for a source org that already has one, the previous shape is marked inactive and replaced by a new active shape. If you don’t want to create scratch orgs based on this shape, you can delete the org shape.

#### Usage

```bash
sf org delete shape [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `-o, --target-org` | string (required) | Username or alias of the target org. Not required if the `target-org` configuration variable is alre... |
| `--api-version` | string | Override the api version used for api requests made by this command |
| `--loglevel` | string |  |
| `-p, --no-prompt` | boolean | Don't prompt for confirmation. |

#### Examples

Delete all org shapes for the source org with alias SourceOrg:

```bash
sf org delete shape --target-org SourceOrg
```

Delete all org shapes without prompting:

```bash
sf org delete shape --target-org SourceOrg --no-prompt
```

#### Aliases

`force:org:shape:delete`

> *Plugin: @salesforce/plugin-signups*


### org delete snapshot

**Delete a scratch org snapshot.**

Dev Hub admins can delete any snapshot. Users can delete only their own snapshots, unless a Dev Hub admin gives the user Modify All permission, which works only with the Salesforce license.

#### Usage

```bash
sf org delete snapshot [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `-v, --target-dev-hub` | string (required) | Username or alias of the Dev Hub org. Not required if the `target-dev-hub` configuration variable is... |
| `--api-version` | string | Override the api version used for api requests made by this command |
| `--loglevel` | string |  |
| `-s, --snapshot` | string (required) | Name or ID of snapshot to delete. |
| `-p, --no-prompt` | boolean | Don't prompt the user to confirm the deletion. |

#### Examples

Delete a snapshot from the default Dev Hub using the snapshot ID:

```bash
sf org delete snapshot --snapshot 0Oo...
```

Delete a snapshot from the specified Dev Hub using the snapshot name:

```bash
sf org delete snapshot --snapshot BaseSnapshot --target-dev-hub SnapshotDevHub
```

#### Aliases

`force:org:snapshot:delete`

> *Plugin: @salesforce/plugin-signups*


### org disable tracking

**Prevent Salesforce CLI from tracking changes in your source files between your project and an org.**

Disabling source tracking has no direct effect on the org, it affects only your local environment. Specifically, Salesforce CLI stores the setting in the org's local configuration file so that no source tracking operations are executed when working with the org.

#### Usage

```bash
sf org disable tracking [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `-o, --target-org` | string (required) | Username or alias of the target org. Not required if the `target-org` configuration variable is alre... |

#### Examples

Disable source tracking for an org with alias "myscratch":

```bash
sf org disable tracking --target-org myscratch
```

Disable source tracking for an org using a username:

```bash
sf org disable tracking --target-org you@example.com
```

Disable source tracking for your default org:

```bash
sf org disable tracking
```

> *Plugin: @salesforce/plugin-org*


### org display

**Display information about an org.**

Output includes your access token, client Id, connected status, org ID, instance URL, username, and alias, if applicable.

Use --verbose to include the SFDX auth URL. WARNING: The SFDX auth URL contains sensitive information, such as a refresh token that can be used to access an org. Don't share or distribute this URL or token.

Including --verbose displays the sfdxAuthUrl property only if you authenticated to the org using "org login web" (not "org login jwt").

#### Usage

```bash
sf org display [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `-o, --target-org` | string (required) | Username or alias of the target org. Not required if the `target-org` configuration variable is alre... |
| `--api-version` | string | Override the api version used for api requests made by this command |
| `--verbose` | boolean | Display the sfdxAuthUrl property. |
| `--loglevel` | string |  |

#### Examples

Display information about your default org:

```bash
$ sf org display
```

Display information, including the sfdxAuthUrl property, about the org with alias TestOrg1:

```bash
$ sf org display --target-org TestOrg1 --verbose
```

#### Aliases

`force:org:display`

> *Plugin: @salesforce/plugin-org*


### org display user

**Display information about a Salesforce user.**

Output includes the profile name, org ID, access token, instance URL, login URL, and alias if applicable. The displayed alias is local and different from the Alias field of the User sObject record of the new user, which you set in the Setup UI.

#### Usage

```bash
sf org display user [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `-o, --target-org` | string (required) | Username or alias of the target org. Not required if the `target-org` configuration variable is alre... |
| `--api-version` | string | Override the api version used for api requests made by this command |
| `--loglevel` | string |  |

#### Examples

Display information about the admin user of your default scratch org:

```bash
sf org display user
```

Display information about the specified user and output in JSON format:

```bash
sf org display user --target-org me@my.org --json
```

#### Aliases

`force:user:display`

> *Plugin: @salesforce/plugin-user*


### org enable tracking

**Allow Salesforce CLI to track changes in your source files between your project and an org.**

Enabling source tracking has no direct effect on the org, it affects only your local environment. Specifically, Salesforce CLI stores the setting in the org's local configuration file so that source tracking operations are executed when working with the org.

This command throws an error if the org doesn't support tracking. Examples of orgs that don't support source tracking include Developer Edition orgs, production orgs, Partial Copy sandboxes, and Full sandboxes.

#### Usage

```bash
sf org enable tracking [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `-o, --target-org` | string (required) | Username or alias of the target org. Not required if the `target-org` configuration variable is alre... |

#### Examples

Enable source tracking for an org with alias "myscratch":

```bash
sf org enable tracking --target-org myscratch
```

Enable source tracking for an org using a username:

```bash
sf org enable tracking --target-org you@example.com
```

Enable source tracking for your default org:

```bash
sf org enable tracking
```

> *Plugin: @salesforce/plugin-org*


### org generate password

**Generate a random password for scratch org users.**

By default, new scratch orgs contain one admin user with no password. Use this command to generate or change a password for this admin user. After it's set, you can’t unset a password, you can only change it.

You can also use the --on-behalf-of flag to generate a password for a scratch org user that you've created locally with the "org create user" command. This command doesn't work for users you created in the scratch org using Setup.

To change the password strength, set the --complexity flag to a value between 0 and 5. Each value specifies the types of characters used in the generated password:

0 - lower case letters only
1 - lower case letters and numbers only
2 - lower case letters and symbols only
3 - lower and upper case letters and numbers only
4 - lower and upper case letters and symbols only
5 - lower and upper case letters and numbers and symbols only

To see a password that was previously generated, run "org display user".

#### Usage

```bash
sf org generate password [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `-b, --on-behalf-of` | string | Comma-separated list of usernames or aliases to assign the password to; must have been created local... |
| `-l, --length` | string | Number of characters in the generated password; valid values are between 8 and 100. |
| `-c, --complexity` | string | Level of password complexity or strength; the higher the value, the stronger the password. |
| `-o, --target-org` | string (required) | Username or alias of the target org. Not required if the `target-org` configuration variable is alre... |
| `--api-version` | string | Override the api version used for api requests made by this command |

#### Examples

Generate a password for the original admin user of your default scratch org:

```bash
sf org generate password
```

Generate a password that contains 12 characters for the original admin user of the scratch org with alias "my-scratch":

```bash
sf org generate password --length 12 --target-org my-scratch
```

Generate a password for your default scratch org admin user that uses lower and upper case letters and numbers only:

```bash
sf org generate password --complexity 3
```

Generate a password for the specified users in the default scratch org; these users must have been created locally with the "org create user" command:

```bash
sf org generate password --on-behalf-of user1@my.org --on-behalf-of user2@my.org --on-behalf-of user3@my.org
```

> *Plugin: @salesforce/plugin-user*


### org get snapshot

**Get details about a scratch org snapshot.**

Snapshot creation can take a while. Use this command with the snapshot name or ID to check its creation status. After the status changes to Active, you can use the snapshot to create scratch orgs.

To create a snapshot, use the "sf org create snapshot" command. To retrieve a list of all snapshots, use "sf org list snapshot".

#### Usage

```bash
sf org get snapshot [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `-v, --target-dev-hub` | string (required) | Username or alias of the Dev Hub org. Not required if the `target-dev-hub` configuration variable is... |
| `--api-version` | string | Override the api version used for api requests made by this command |
| `--loglevel` | string |  |
| `-s, --snapshot` | string (required) | Name or ID of snapshot to retrieve. |

#### Examples

Get snapshot details using its ID and the default Dev Hub org:

```bash
sf org get snapshot --snapshot 0Oo...
```

Get snapshot details using its name from a Dev Hub org with alias SnapshotDevHub:

```bash
sf org get snapshot --snapshot Dependencies --target-dev-hub SnapshotDevHub
```

#### Aliases

`force:org:snapshot:get`

> *Plugin: @salesforce/plugin-signups*


### org list

**List all orgs you’ve created or authenticated to.**

#### Usage

```bash
sf org list [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `--verbose` | boolean | List more information about each org. |
| `--all` | boolean | Include expired, deleted, and unknown-status scratch orgs. |
| `--clean` | boolean | Remove all local org authorizations for non-active scratch orgs. Use "org logout" to remove non-scra... |
| `-p, --no-prompt` | boolean | Don't prompt for confirmation. |
| `--skip-connection-status` | boolean | Skip retrieving the connection status of non-scratch orgs. |
| `--loglevel` | string |  |

#### Examples

List all orgs you've created or authenticated to:

```bash
$ sf org list
```

List all orgs, including expired, deleted, and unknown-status orgs; don't include the connection status:

```bash
$ sf org list --skip-connection-status --all
```

List orgs and remove local org authorization info about non-active scratch orgs:

```bash
$ sf org list --clean
```

#### Aliases

`force:org:list`

> *Plugin: @salesforce/plugin-org*


### org list auth

**List authorization information about the orgs you created or logged into.**

This command uses local authorization information that Salesforce CLI caches when you create a scratch org or log into an org. The command doesn't actually connect to the orgs to verify that they're still active. As a result, this command executes very quickly. If you want to view live information about your authorized orgs, such as their connection status, use the "org list" command.

#### Usage

```bash
sf org list auth [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `--loglevel` | string |  |

#### Examples

List local authorization information about your orgs:

```bash
sf org list auth
```

#### Aliases

`force:auth:list`, `auth:list`

> *Plugin: @salesforce/plugin-auth*


### org list limits

**Display information about limits in your org.**

For each limit, this command returns the maximum allocation and the remaining allocation based on usage. See this topic for a description of each limit: https://developer.salesforce.com/docs/atlas.en-us.api_rest.meta/api_rest/resources_limits.htm.

#### Usage

```bash
sf org list limits [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `-o, --target-org` | string (required) | Username or alias of the target org. Not required if the `target-org` configuration variable is alre... |
| `--api-version` | string | Override the api version used for api requests made by this command |
| `--loglevel` | string |  |

#### Examples

Display limits in your default org:

```bash
sf org list limits
```

Display limits in the org with alias "my-scratch-org":

```bash
sf org list limits --target-org my-scratch-org
```

#### Aliases

`force:limits:api:display`, `limits:api:display`

> *Plugin: @salesforce/plugin-limits*


### org list metadata

**List the metadata components and properties of a specified type.**

Use this command to identify individual components in your manifest file or if you want a high-level view of particular metadata types in your org. For example, you can use this command to return a list of names of all the CustomObject or Layout components in your org, then use this information in a retrieve command that returns a subset of these components.

The username that you use to connect to the org must have the Modify All Data or Modify Metadata Through Metadata API Functions permission.

#### Usage

```bash
sf org list metadata [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `--api-version` | string | API version to use; default is the most recent API version. |
| `--loglevel` | string |  |
| `-o, --target-org` | string (required) | Username or alias of the target org. Not required if the `target-org` configuration variable is alre... |
| `-f, --output-file` | string | Pathname of the file in which to write the results. |
| `-m, --metadata-type` | string (required) | Metadata type to be retrieved, such as CustomObject; metadata type names are case-sensitive. |
| `--folder` | string | Folder associated with the component; required for components that use folders; folder names are cas... |

#### Examples

List the CustomObject components, and their properties, in the org with alias "my-dev-org":

```bash
$ sf org list metadata --metadata-type CustomObject --target-org my-dev-org
```

List the CustomObject components in your default org, write the output to the specified file, and use API version 57.0:

```bash
$ sf org list metadata --metadata-type CustomObject --api-version 57.0 --output-file /path/to/outputfilename.txt
```

List the Dashboard components in your default org that are contained in the "folderSales" folder, write the output to the specified file, and use API version 57.0:

```bash
$ sf org list metadata --metadata-type Dashboard --folder folderSales --api-version 57.0 --output-file /path/to/outputfilename.txt
```

#### Aliases

`force:mdapi:listmetadata`

> *Plugin: @salesforce/plugin-org*


### org list metadata-types

**Display details about the metadata types that are enabled for your org.**

The information includes Apex classes and triggers, custom objects, custom fields on standard objects, tab sets that define an app, and many other metadata types. Use this information to identify the syntax needed for a <name> element in a manifest file (package.xml).

The username that you use to connect to the org must have the Modify All Data or Modify Metadata Through Metadata API Functions permission.

#### Usage

```bash
sf org list metadata-types [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `--api-version` | string | API version to use; default is the most recent API version. |
| `--loglevel` | string |  |
| `-o, --target-org` | string (required) | Username or alias of the target org. Not required if the `target-org` configuration variable is alre... |
| `-f, --output-file` | string | Pathname of the file in which to write the results. |
| `-k, --filter-known` | boolean | Filter the known metadata types from the result to display only the types not yet fully supported by... |

#### Examples

Display information about all known and enabled metadata types in the org with alias "my-dev-org" using API version 57.0:

```bash
$ sf org list metadata-types --api-version 57.0 --target-org my-dev-org
```

Display only the metadata types that aren't yet supported by Salesforce CLI in your default org and write the results to the specified file:

```bash
$ sf org list metadata-types --output-file /path/to/outputfilename.txt --filter-known
```

#### Aliases

`force:mdapi:describemetadata`

> *Plugin: @salesforce/plugin-org*


### org list shape

**List all org shapes you’ve created.**

The output includes the alias, username, and ID of the source org, the status of the org shape creation, and more. Use the org ID to update your scratch org configuration file so you can create a scratch org based on this org shape.

#### Usage

```bash
sf org list shape [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `--verbose` | boolean | List more information about each org shape. |
| `--loglevel` | string |  |

#### Examples

List all org shapes you've created:

```bash
sf org list shape
```

List all org shapes in JSON format and write the output to a file:

```bash
sf org list shape --json > tmp/MyOrgShapeList.json
```

#### Aliases

`force:org:shape:list`

> *Plugin: @salesforce/plugin-signups*


### org list snapshot

**List scratch org snapshots.**

You can view all the snapshots in a Dev Hub that you have access to. If you’re an admin, you can see all snapshots associated with the Dev Hub org. If you’re a user, you can see only your snapshots unless a Dev Hub admin gives you View All permissions.

To create a snapshot, use the "sf org create snapshot" command. To get details about a snapshot request, use "sf org get snapshot".

#### Usage

```bash
sf org list snapshot [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `-v, --target-dev-hub` | string (required) | Username or alias of the Dev Hub org. Not required if the `target-dev-hub` configuration variable is... |
| `--api-version` | string | Override the api version used for api requests made by this command |
| `--loglevel` | string |  |

#### Examples

List snapshots in the default Dev Hub:

```bash
sf org list snapshot
```

List snapshots in the Dev Hub with alias SnapshotDevHub:

```bash
sf org list snapshot --target-dev-hub SnapshotDevHub
```

#### Aliases

`force:org:snapshot:list`

> *Plugin: @salesforce/plugin-signups*


### org list sobject record-counts

**Display record counts for the specified standard or custom objects.**

Use this command to get an approximate count of the records in standard or custom objects in your org. These record counts are the same as the counts listed in the Storage Usage page in the Setup UI. The record counts are approximate because they're calculated asynchronously and your org's storage usage isn't updated immediately. To display all available record counts, run the command without the --sobject flag.

#### Usage

```bash
sf org list sobject record-counts [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `-s, --sobject` | string | API name of the standard or custom object for which to display record counts. |
| `-o, --target-org` | string (required) | Username or alias of the target org. Not required if the `target-org` configuration variable is alre... |
| `--api-version` | string | Override the api version used for api requests made by this command |
| `--loglevel` | string |  |

#### Examples

Display all available record counts in your default org:

```bash
sf org list sobject record-counts
```

Display record counts for the Account, Contact, Lead, and Opportunity objects in your default org:

```bash
sf org list sobject record-counts --sobject Account --sobject Contact --sobject Lead --sobject Opportunity
```

Display record counts for the Account and Lead objects for the org with alias "my-scratch-org":

```bash
sf org list sobject record-counts --sobject Account --sobject Lead --target-org my-scratch-org
```

#### Aliases

`force:limits:recordcounts:display`, `limits:recordcounts:display`

> *Plugin: @salesforce/plugin-limits*


### org list users

**List all locally-authenticated users of an org.**

For scratch orgs, the list includes any users you've created with the "org create user" command; the original scratch org admin user is marked with "(A)". For other orgs, the list includes the users you used to authenticate to the org.

#### Usage

```bash
sf org list users [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `-o, --target-org` | string (required) | Username or alias of the target org. Not required if the `target-org` configuration variable is alre... |
| `--api-version` | string | Override the api version used for api requests made by this command |
| `--loglevel` | string |  |

#### Examples

List the locally-authenticated users of your default org:

```bash
sf org list users
```

List the locally-authenticated users of the specified org:

```bash
sf org list users --target-org me@my.org
```

#### Aliases

`force:user:list`

> *Plugin: @salesforce/plugin-user*


### org login access-token

**Authorize an org using an existing Salesforce access token.**

By default, the command runs interactively and asks you for the access token. If you previously authorized the org, the command prompts whether you want to overwrite the local file. Specify --no-prompt to not be prompted.

To use the command in a CI/CD script, set the SF_ACCESS_TOKEN environment variable to the access token. Then run the command with the --no-prompt parameter.

#### Usage

```bash
sf org login access-token [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `-r, --instance-url` | string (required) | URL of the instance that the org lives on. |
| `-d, --set-default-dev-hub` | boolean | Set the authenticated org as the default Dev Hub. |
| `-s, --set-default` | boolean | Set the authenticated org as the default that all org-related commands run against. |
| `-a, --alias` | string | Alias for the org. |
| `-p, --no-prompt` | boolean | Don't prompt for confirmation. |
| `--loglevel` | string |  |

#### Examples

Authorize an org on https://mycompany.my.salesforce.com; the command prompts you for the access token:

```bash
sf org login access-token --instance-url https://mycompany.my.salesforce.com
```

Authorize the org without being prompted; you must have previously set the SF_ACCESS_TOKEN environment variable to the access token:

```bash
sf org login access-token --instance-url https://dev-hub.my.salesforce.com --no-prompt
```

#### Aliases

`force:auth:accesstoken:store`, `auth:accesstoken:store`

> *Plugin: @salesforce/plugin-auth*


### org login jwt

**Log in to a Salesforce org using a JSON web token (JWT).**

Use this command in automated environments where you can’t interactively log in with a browser, such as in CI/CD scripts.

Logging into an org authorizes the CLI to run other commands that connect to that org, such as deploying or retrieving a project. You can log into many types of orgs, such as sandboxes, Dev Hubs, Env Hubs, production orgs, and scratch orgs.

Complete these steps before you run this command:

    1. Create a digital certificate (also called digital signature) and the private key to sign the certificate. You can use your own key and certificate issued by a certification authority. Or use OpenSSL to create a key and a self-signed digital certificate.
    2. Store the private key in a file on your computer. When you run this command, you set the --jwt-key-file flag to this file.
    3. Create a custom connected app in your org using the digital certificate. Make note of the consumer key (also called client id) that’s generated for you. Be sure the username of the user logging in is approved to use the connected app. When you run this command, you set the --client-id flag to the consumer key.

See https://developer.salesforce.com/docs/atlas.en-us.sfdx_dev.meta/sfdx_dev/sfdx_dev_auth_jwt_flow.htm for more information.

We recommend that you set an alias when you log into an org. Aliases make it easy to later reference this org when running commands that require it. If you don’t set an alias, you use the username that you specified when you logged in to the org. If you run multiple commands that reference the same org, consider setting the org as your default. Use --set-default for your default scratch org or sandbox, or --set-default-dev-hub for your default Dev Hub.

#### Usage

```bash
sf org login jwt [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `-o, --username` | string (required) | Username of the user logging in. |
| `-f, --jwt-key-file` | string (required) | Path to a file containing the private key. |
| `-i, --client-id` | string (required) | OAuth client ID (also called consumer key) of your custom connected app. |
| `-r, --instance-url` | string | URL of the instance that the org lives on. |
| `-d, --set-default-dev-hub` | boolean | Set the authenticated org as the default Dev Hub. |
| `-s, --set-default` | boolean | Set the authenticated org as the default that all org-related commands run against. |
| `-a, --alias` | string | Alias for the org. |
| `-p, --no-prompt` | boolean | Don't prompt for confirmation. |
| `--loglevel` | string |  |

#### Examples

Log into an org with username jdoe@example.org and on the default instance URL (https://login.salesforce.com). The private key is stored in the file /Users/jdoe/JWT/server.key and the command uses the connected app with consumer key (client id) 04580y4051234051.

```bash
sf org login jwt --username jdoe@example.org --jwt-key-file /Users/jdoe/JWT/server.key --client-id 04580y4051234051
```

Set the org as the default and give it an alias:

```bash
sf org login jwt --username jdoe@example.org --jwt-key-file /Users/jdoe/JWT/server.key --client-id 04580y4051234051 --alias ci-org --set-default
```

Set the org as the default Dev Hub and give it an alias:

```bash
sf org login jwt --username jdoe@example.org --jwt-key-file /Users/jdoe/JWT/server.key --client-id 04580y4051234051 --alias ci-dev-hub --set-default-dev-hub
```

Log in to a sandbox using URL https://MyDomainName--SandboxName.sandbox.my.salesforce.com:

```bash
sf org login jwt --username jdoe@example.org --jwt-key-file /Users/jdoe/JWT/server.key --client-id 04580y4051234051 --alias ci-org --set-default --instance-url https://MyDomainName--SandboxName.sandbox.my.salesforce.com
```

#### Aliases

`force:auth:jwt:grant`, `auth:jwt:grant`

> *Plugin: @salesforce/plugin-auth*


### org login sfdx-url

**Authorize an org using a Salesforce DX authorization URL stored in a file or through standard input (stdin).**

You use the Salesforce DX (SFDX) authorization URL to authorize Salesforce CLI to connect to a target org. The URL contains the required data to accomplish the authorization, such as the client ID, client secret, and instance URL. You must specify the SFDX authorization URL in this format: "force://<clientId>:<clientSecret>:<refreshToken>@<instanceUrl>". Replace <clientId>, <clientSecret>, <refreshToken>, and <instanceUrl> with the values specific to your target org. For <instanceUrl>, don't include a protocol (such as "https://"). Note that although the SFDX authorization URL starts with "force://", it has nothing to do with the actual authorization. Salesforce CLI always communicates with your org using HTTPS.

To see an example of an SFDX authorization URL, run "org display --verbose" on an org.

You have three options when creating the authorization file. The easiest option is to redirect the output of the "sf org display --verbose --json" command into a file. For example, using an org with alias my-org that you've already authorized:

    $ sf org display --target-org my-org --verbose --json > authFile.json

The resulting JSON file contains the URL in the "sfdxAuthUrl" property of the "result" object. You can then reference the file when running this command:

    $ sf org:login:sfdx-url --sfdx-url-file authFile.json

NOTE: The "sf org display --verbose" command displays the refresh token only for orgs authorized with the web server flow, and not the JWT bearer flow.

You can also create a JSON file that has a top-level property named sfdxAuthUrl whose value is the authorization URL. Finally, you can create a normal text file that includes just the URL and nothing else.

Alternatively, you can pipe the SFDX authorization URL through standard input by specifying the --sfdx-url-stdin flag.

#### Usage

```bash
sf org login sfdx-url [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `-f, --sfdx-url-file` | string | Path to a file that contains the Salesforce DX authorization URL. |
| `-u, --sfdx-url-stdin` | string | Pipe the Salesforce DX authorization URL through standard input (stdin). |
| `-d, --set-default-dev-hub` | boolean | Set the authenticated org as the default Dev Hub. |
| `-s, --set-default` | boolean | Set the authenticated org as the default that all org-related commands run against. |
| `-a, --alias` | string | Alias for the org. |
| `-p, --no-prompt` | boolean | Don't prompt for confirmation. |
| `--loglevel` | string |  |

#### Examples

Authorize an org using the SFDX authorization URL in the files/authFile.json file:

```bash
sf org login sfdx-url --sfdx-url-file files/authFile.json
```

Similar to previous example, but set the org as your default and give it an alias MyDefaultOrg:

```bash
sf org login sfdx-url --sfdx-url-file files/authFile.json --set-default --alias MyDefaultOrg
```

Pipe the SFDX authorization URL from stdin:

```bash
$ echo url | sf org login sfdx-url --sfdx-url-stdin
```

#### Aliases

`force:auth:sfdxurl:store`, `auth:sfdxurl:store`

> *Plugin: @salesforce/plugin-auth*


### org login web

**Log in to a Salesforce org using the web server flow.**

Opens a Salesforce instance URL in a web browser so you can enter your credentials and log in to your org. After you log in, you can close the browser window.

Logging into an org authorizes the CLI to run other commands that connect to that org, such as deploying or retrieving metadata. You can log into many types of orgs, such as sandboxes, Dev Hubs, Env Hubs, production orgs, and scratch orgs.

We recommend that you set an alias when you log into an org. Aliases make it easy to later reference this org when running commands that require it. If you don’t set an alias, you use the username that you specified when you logged in to the org. If you run multiple commands that reference the same org, consider setting the org as your default. Use --set-default for your default scratch org or sandbox, or --set-default-dev-hub for your default Dev Hub.

By default, this command uses the global out-of-the-box connected app in your org. If you need more security or control, such as setting the refresh token timeout or specifying IP ranges, create your own connected app using a digital certificate. Make note of the consumer key (also called cliend id) that’s generated for you. Then specify the consumer key with the --client-id flag.

You can also use this command to link one or more connected or external client apps in an org to an already-authenticated user. Then Salesforce CLI commands that have API-specific requirements, such as new OAuth scopes or JWT-based access tokens, can use these custom client apps rather than the default one. To create the link, you use the --client-app flag to give the link a name and the --username flag to specify the already-authenticated user. Use the --scopes flag to add OAuth scopes if required. After you create the link, you then use the --client-app value in the other command that has the API-specific requirements. An example of a command that uses this feature is "agent preview"; see the "Preview an Agent" section in the "Agentforce Developer Guide" for details and examples. (https://developer.salesforce.com/docs/einstein/genai/guide/agent-dx-preview.html)

#### Usage

```bash
sf org login web [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `-b, --browser` | string | Browser in which to open the org. |
| `-i, --client-id` | string | OAuth client ID (also called consumer key) of your custom connected app. |
| `-r, --instance-url` | string | URL of the instance that the org lives on. |
| `-d, --set-default-dev-hub` | boolean | Set the authenticated org as the default Dev Hub. |
| `-s, --set-default` | boolean | Set the authenticated org as the default that all org-related commands run against. |
| `-a, --alias` | string | Alias for the org. |
| `-p, --no-prompt` | boolean | Don't prompt for confirmation. |
| `--loglevel` | string |  |
| `-c, --client-app` | string | Name to give to the link between the connected app or external client and the already-authenticated ... |
| `--username` | string | Username of the already-authenticated user to link to the connected app or external client app. Must... |
| `--scopes` | string | Authentication (OAuth) scopes to request. Use the scope's short name; specify multiple scopes using ... |

#### Examples

Run the command with no flags to open the default Salesforce login page (https://login.salesforce.com):

```bash
sf org login web
```

Log in to your Dev Hub, set it as your default Dev Hub, and set an alias that you reference later when you create a scratch org:

```bash
sf org login web --set-default-dev-hub --alias dev-hub
```

Log in to a sandbox and set it as your default org:

```bash
sf org login web --instance-url https://MyDomainName--SandboxName.sandbox.my.salesforce.com --set-default
```

Use --browser to specify a specific browser, such as Google Chrome:

```bash
sf org login web --instance-url https://MyDomainName--SandboxName.sandbox.my.salesforce.com --set-default --browser chrome
```

Use your own connected app by specifying its consumer key (also called client ID) and specify additional OAuth scopes:

```bash
sf org login web --instance-url https://MyDomainName--SandboxName.sandbox.my.salesforce.com --set-default --browser chrome --client-id 04580y4051234051 --scopes "sfap_api chatbot_api"
```

#### Aliases

`force:auth:web:login`, `auth:web:login`

> *Plugin: @salesforce/plugin-auth*


### org logout

**Log out of a Salesforce org.**

If you run this command with no flags and no default org set in your config or environment, it first displays a list of orgs you've created or logged into, with none of the orgs selected. Use the arrow keys to scroll through the list and the space bar to select the orgs you want to log out of. Press Enter when you're done; the command asks for a final confirmation before logging out of the selected orgs.

The process is similar if you specify --all, except that in the initial list of orgs, they're all selected. Use --target-org to logout of a specific org. In both these cases by default, you must still confirm that you want to log out. Use --no-prompt to never be asked for confirmation when also using --all or --target-org.

Be careful! If you log out of a scratch org without having access to its password, you can't access the scratch org again, either through the CLI or the Salesforce UI.

Use the --client-app flag to log out of the link you previously created between an authenticated user and a connected app or external client app; you create these links with "org login web --client-app". Run "org display" to get the list of client app names.

#### Usage

```bash
sf org logout [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `-o, --target-org` | string | Username or alias of the target org. |
| `-c, --client-app` | string | Client app to log out of. |
| `-a, --all` | boolean | Include all authenticated orgs. |
| `-p, --no-prompt` | boolean | Don't prompt for confirmation. |
| `--loglevel` | string |  |

#### Examples

Interactively select the orgs to log out of:

```bash
sf org logout
```

Log out of the org with username me@my.org:

```bash
sf org logout --target-org me@my.org
```

Log out of all orgs after confirmation:

```bash
sf org logout --all
```

Logout of the org with alias my-scratch and don't prompt for confirmation:

```bash
sf org logout --target-org my-scratch --no-prompt
```

#### Aliases

`force:auth:logout`, `auth:logout`

> *Plugin: @salesforce/plugin-auth*


### org open

**Open your default scratch org, or another specified org, in a browser.**

To open a specific page, specify the portion of the URL after "https://mydomain.my.salesforce.com" as the value for the --path flag. For example, specify "--path lightning" to open Lightning Experience, or specify "--path /apex/YourPage" to open a Visualforce page.

Use the --source-file flag to open ApexPage, FlexiPage, Flow, or Agent metadata from your local project in the associated Builder within the Org.

To generate a URL but not launch it in your browser, specify --url-only.

To open in a specific browser, use the --browser flag. Supported browsers are "chrome", "edge", and "firefox". If you don't specify --browser, the org opens in your default browser.

#### Usage

```bash
sf org open [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `-o, --target-org` | string (required) | Username or alias of the target org. Not required if the `target-org` configuration variable is alre... |
| `--api-version` | string | Override the api version used for api requests made by this command |
| `--private` | boolean | Open the org in the default browser using private (incognito) mode. |
| `-b, --browser` | string | Browser where the org opens. |
| `-p, --path` | string | Navigation URL path to open a specific page. |
| `-r, --url-only` | boolean | Display navigation URL, but don’t launch browser. |
| `--loglevel` | string |  |
| `-f, --source-file` | string | Path to ApexPage, FlexiPage, Flow, or Agent metadata to open in the associated Builder. |

#### Examples

Open your default org in your default browser:

```bash
$ sf org open
```

Open your default org in an incognito window of your default browser:

```bash
$ sf org open --private
```

Open the org with alias MyTestOrg1 in the Firefox browser:

```bash
$ sf org open --target-org MyTestOrg1 --browser firefox
```

Display the navigation URL for the Lightning Experience page for your default org, but don't open the page in a browser:

```bash
$ sf org open --url-only --path lightning
```

Open a local Lightning page in your default org's Lightning App Builder:

```bash
$ sf org open --source-file force-app/main/default/flexipages/Hello.flexipage-meta.xml
```

Open a local Flow in Flow Builder:

```bash
$ sf org open --source-file force-app/main/default/flows/Hello.flow-meta.xml
```

Open local Agent metadata (Bot) in Agent Builder:

```bash
$ sf org open --source-file force-app/main/default/bots/Coral_Cloud_Agent/Coral_Cloud_Agent.bot-meta.xml
```

#### Aliases

`force:org:open`, `force:source:open`

> *Plugin: @salesforce/plugin-org*


### org open agent

**Open an agent in your org's Agent Builder UI in a browser.**

Use the --api-name flag to open an agent using its API name in the Agent Builder UI of your org. To find the agent's API name, go to Setup in your org and navigate to the agent's details page.

To generate the URL but not launch it in your browser, specify --url-only.

To open Agent Builder in a specific browser, use the --browser flag. Supported browsers are "chrome", "edge", and "firefox". If you don't specify --browser, the org opens in your default browser.

#### Usage

```bash
sf org open agent [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `-o, --target-org` | string (required) | Username or alias of the target org. Not required if the `target-org` configuration variable is alre... |
| `--api-version` | string | Override the api version used for api requests made by this command |
| `-n, --api-name` | string (required) | API name, also known as developer name, of the agent you want to open in the org's Agent Builder UI. |
| `--private` | boolean | Open the org in the default browser using private (incognito) mode. |
| `-b, --browser` | string | Browser where the org opens. |
| `-r, --url-only` | boolean | Display navigation URL, but don’t launch browser. |

#### Examples

Open the agent with API name Coral_Cloud_Agent in your default org using your default browser:

```bash
$ sf org open agent --api-name Coral_Cloud_Agent
```

Open the agent in an incognito window of your default browser:

```bash
$ sf org open agent --private --api-name Coral_Cloud_Agent:
```

Open the agent in an org with alias MyTestOrg1 using the Firefox browser:

```bash
$ sf org open agent --target-org MyTestOrg1 --browser firefox --api-name Coral_Cloud_Agent
```

> *Plugin: @salesforce/plugin-org*


### org refresh sandbox

**Refresh a sandbox org using the sandbox name.**

Refreshing a sandbox copies the metadata, and optionally data, from your source org to the refreshed sandbox org. You can optionally specify a definition file if you want to change the configuration of the refreshed sandbox, such as its license type or template ID. You can also use the --source-id or --source-sandbox-name flags to change the refreshed sandbox org's original source org to a new org; in this case, the refreshed sandbox org's metadata is updated with the new source org's metadata.

You're not allowed to change the sandbox name when you refresh it with this command. If you want to change the sandbox name, first delete it with the "org delete sandbox" command. And then recreate it with the "org create sandbox" command and give it a new name.

#### Usage

```bash
sf org refresh sandbox [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `--no-auto-activate` | boolean | Disable auto-activation of the sandbox after a successful refresh. |
| `-w, --wait` | string | Number of minutes to poll for sandbox refresh status. |
| `-i, --poll-interval` | string | Number of seconds to wait between status polling requests. |
| `--source-sandbox-name` | string | Name of the sandbox org that becomes the new source org for the refreshed sandbox. |
| `--source-id` | string | ID of the sandbox org that becomes the new source org for the refreshed sandbox. |
| `--async` | boolean | Request the sandbox refresh, but don't wait for it to complete. |
| `-n, --name` | string | Name of the existing sandbox org in your production org that you want to refresh. |
| `-f, --definition-file` | string | Path to a sandbox definition file for overriding its configuration when you refresh it. |
| `-o, --target-org` | string (required) | Username or alias of the production org that contains the sandbox license. |
| `--no-prompt` | boolean | Don't prompt for confirmation about the sandbox refresh. |

#### Examples

Refresh the sandbox named "devSbx1". The production org that contains the sandbox license has the alias "prodOrg".

```bash
sf org refresh sandbox --name devSbx1 --target-org prodOrg
```

Refresh the sandbox named "devSbx2", and override the configuration of the refreshed sandbox with the properties in the specified defintion file. The default target org is the production org, so you don't need to specify the `--target-org` flag in this case.

```bash
sf org refresh sandbox --name devSbx2 --definition-file devSbx2-config.json
```

Refresh the sandbox using the name defined in the definition file. The production org that contains the sandbox license has the alias "prodOrg".

```bash
sf org refresh sandbox --definition-file devSbx3-config.json --target-org prodOrg
```

Refresh the sandbox named "devSbx2" by changing its original source org to be a sandbox called "devSbx3":

```bash
sf org refresh sandbox --name devSbx2 --source-sandbox-name devSbx3 --target-org prodOrg
```

> *Plugin: @salesforce/plugin-org*


### org resume sandbox

**Check the status of a sandbox creation, and log in to it if it's ready.**

Sandbox creation can take a long time. If the original "sf org create sandbox" command either times out, or you specified the --async flag, the command displays a job ID. Use this job ID to check whether the sandbox creation is complete, and if it is, the command then logs into it.

You can also use the sandbox name to check the status or the --use-most-recent flag to use the job ID of the most recent sandbox creation.

#### Usage

```bash
sf org resume sandbox [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `-w, --wait` | string | Number of minutes to wait for the sandbox org to be ready. |
| `-n, --name` | string | Name of the sandbox org. |
| `-i, --job-id` | string | Job ID of the incomplete sandbox creation that you want to check the status of. |
| `-l, --use-most-recent` | boolean | Use the most recent sandbox create request. |
| `-o, --target-org` | string | Username or alias of the production org that contains the sandbox license. |

#### Examples

Check the status of a sandbox creation using its name and specify a production org with alias "prodOrg":

```bash
sf org resume sandbox --name mysandbox --target-org prodOrg
```

Check the status using the job ID:

```bash
sf org resume sandbox --job-id 0GRxxxxxxxx
```

Check the status of the most recent sandbox create request:

```bash
sf org resume sandbox --use-most-recent
```

#### Aliases

`env:resume:sandbox`

> *Plugin: @salesforce/plugin-org*


### org resume scratch

**Resume the creation of an incomplete scratch org.**

When the original "sf org create scratch" command either times out or is run with the --async flag, it displays a job ID.

Run this command by either passing it a job ID or using the --use-most-recent flag to specify the most recent incomplete scratch org.

#### Usage

```bash
sf org resume scratch [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `-i, --job-id` | string | Job ID of the incomplete scratch org create that you want to resume. |
| `-r, --use-most-recent` | boolean | Use the job ID of the most recent incomplete scratch org. |
| `-w, --wait` | string | Number of minutes to wait for the scratch org to be ready. |

#### Examples

Resume a scratch org create with a job ID:

```bash
sf org resume scratch --job-id 2SR3u0000008fBDGAY
```

Resume your most recent incomplete scratch org:

```bash
sf org resume scratch --use-most-recent
```

#### Aliases

`env:resume:scratch`

> *Plugin: @salesforce/plugin-org*


---

## package

*25 commands in this topic*

### package convert

**Convert a managed-released first-generation managed package into a second-generation managed package.**

The package conversion command automatically selects the latest released major.minor first-generation managed package version, and converts it into a second-generation managed package version.

Use --patch-version to specify a released patch version.

To retrieve details about a package version create request, including status and package version ID (04t), run "sf package version create report -i 08c...".

To protect the contents of your package and to prevent unauthorized installation of your package, specify the --installation-key flag.

To promote a package version to released, you must use the --code-coverage parameter. The package must also meet the code coverage requirements.

To list package version creation requests in the org, run "sf package version create list".

#### Usage

```bash
sf package convert [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `--loglevel` | string |  |
| `-v, --target-dev-hub` | string (required) | Username or alias of the Dev Hub org. Not required if the `target-dev-hub` configuration variable is... |
| `--api-version` | string | Override the api version used for api requests made by this command |
| `-p, --package` | string (required) | ID (starts with 033) of the first-generation managed package to convert. |
| `-k, --installation-key` | string | Installation key for key-protected package. |
| `-f, --definition-file` | string | Path to a definition file that contains features and org preferences that the metadata of the packag... |
| `-x, --installation-key-bypass` | boolean | Bypass the installation key requirement. |
| `-w, --wait` | string | Minutes to wait for the package version to be created. |
| `-s, --build-instance` | string | Instance where the conversion package version will be created, such as NA50. |
| `-m, --seed-metadata` | string | Directory containing metadata to be deployed prior to conversion. |
| `--verbose` | boolean | Display verbose command output. |
| `-a, --patch-version` | string | Specific released patch version to be converted. |
| `-c, --code-coverage` | boolean | Calculate and store the code coverage percentage by running the packaged Apex tests included in this... |

#### Examples

Create a second-generation managed package version from the first-generation managed package with the specified ID and give it the installation key "password123"; uses your default Dev Hub org:

```bash
sf package convert --package 033... --installation-key password123
```

Similar to previous example, but uses the specified Dev Hub org:

```bash
sf package convert --package 033... --installation-key password123 --target-dev-hub devhuborg@example.com
```

#### Aliases

`force:package:convert`

> *Plugin: @salesforce/plugin-packaging*


### package create

**Create a package.**

First, use this command to create a package. Then create a package version.

If you don’t have a namespace defined in your sfdx-project.json file, use --no-namespace.

Your --name value must be unique within your namespace.

Run 'sf package list to list all packages in the Dev Hub org.

#### Usage

```bash
sf package create [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `--loglevel` | string |  |
| `-v, --target-dev-hub` | string (required) | Username or alias of the Dev Hub org. Not required if the `target-dev-hub` configuration variable is... |
| `--api-version` | string | Override the api version used for api requests made by this command |
| `-n, --name` | string (required) | Name of the package to create. |
| `-t, --package-type` | string (required) | Type of package. |
| `-d, --description` | string | Description of the package. |
| `-e, --no-namespace` | boolean | Create the package with no namespace; available only for unlocked packages. |
| `-r, --path` | string (required) | Path to directory that contains the contents of the package. |
| `--org-dependent` | boolean | Depends on unpackaged metadata in the installation org; applies to unlocked packages only. |
| `-o, --error-notification-username` | string | Active Dev Hub user designated to receive email notifications for package errors. |

#### Examples

Create an unlocked package from the files in the "force-app" directory; uses your default Dev Hub org:

```bash
sf package create --name MyUnlockedPackage --package-type Unlocked --path force-app
```

Create a managed packaged from the "force-app" directory files, give the package a description, and use the specified Dev Hub org:

```bash
sf package create --name MyManagedPackage --description "Your Package Descripton" --package-type Managed --path force-app --target-dev-hub devhub@example.com
```

#### Aliases

`force:package:create`

> *Plugin: @salesforce/plugin-packaging*


### package delete

**Delete a package.**

Specify the ID or alias of the package you want to delete.

Delete unlocked and second-generation managed packages. Before you delete a package, first delete all associated package versions.

#### Usage

```bash
sf package delete [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `--loglevel` | string |  |
| `-v, --target-dev-hub` | string (required) | Username or alias of the Dev Hub org. Not required if the `target-dev-hub` configuration variable is... |
| `--api-version` | string | Override the api version used for api requests made by this command |
| `-n, --no-prompt` | boolean | Don't prompt before deleting the package. |
| `-p, --package` | string (required) | ID (starts with 0Ho) or alias of the package to delete. |
| `--undelete` | boolean | Undelete a deleted package. |

#### Examples

Delete a package using its alias from your default Dev Hub org:

```bash
sf package delete --package "Your Package Alias"
```

Delete a package using its ID from the specified Dev Hub org:

```bash
sf package delete --package 0Ho... --target-dev-hub devhub@example.com
```

#### Aliases

`force:package:delete`

> *Plugin: @salesforce/plugin-packaging*


### package install

**Install or upgrade a version of a package in the target org.**

To install or upgrade a package, specify a specific version of the package using the 04t package ID. The package and the version you specified installs in your default target org unless you supply the username for a different target org.

When upgrading an unlocked package, include the --upgrade-type value to specify whether any removed components are deprecated or deleted. To delete components that can be safely deleted and deprecate the others, specify "--upgrade-type Mixed" (the default). To deprecate all removed components, specify "--upgrade-type DeprecateOnly". To delete all removed components, except for custom objects and custom fields, that don't have dependencies, specify "--upgrade-type Delete". (Note: This option can result in the loss of data that is associated with the deleted components.)

#### Usage

```bash
sf package install [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `--loglevel` | string |  |
| `-o, --target-org` | string (required) | Username or alias of the target org. Not required if the `target-org` configuration variable is alre... |
| `--api-version` | string | Override the api version used for api requests made by this command |
| `-w, --wait` | string | Number of minutes to wait for installation status. |
| `-k, --installation-key` | string | Installation key for key-protected package (default: null). |
| `-b, --publish-wait` | string | Maximum number of minutes to wait for the Subscriber Package Version ID to become available in the t... |
| `-r, --no-prompt` | boolean | Don't prompt for confirmation. |
| `-p, --package` | string (required) | ID (starts with 04t) or alias of the package version to install. |
| `-a, --apex-compile` | string | Compile all Apex in the org and package, or only Apex in the package; unlocked packages only. |
| `-s, --security-type` | string | Security access type for the installed package. Available options are AdminsOnly and AllUsers. |
| `-t, --upgrade-type` | string | Upgrade type for the package installation; available only for unlocked packages. |
| `-l, --skip-handlers` | string | Skip install handlers (available handlers: FeatureEnforcement). |

#### Examples

Install or upgrade a package version with the specified ID in the org with username "me@example.com":

```bash
sf package install --package 04t... --target-org me@example.com
```

Install or upgrade a package version with the specified alias into your default org:

```bash
sf package install --package awesome_package_alias
```

Install or upgrade a package version with an alias that includes spaces into your default org:

```bash
sf package install --package "Awesome Package Alias"
```

Upgrade an unlocked package version with the specified ID and deprecate all removed components:

```bash
sf package install --package 04t... --upgrade-type DeprecateOnly
```

#### Aliases

`force:package:install`

> *Plugin: @salesforce/plugin-packaging*


### package install report

**Retrieve the status of a package installation request.**

#### Usage

```bash
sf package install report [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `-o, --target-org` | string (required) | Username or alias of the target org. Not required if the `target-org` configuration variable is alre... |
| `--api-version` | string | Override the api version used for api requests made by this command |
| `--loglevel` | string |  |
| `-i, --request-id` | string (required) | ID of the package install request you want to check; starts with 0Hf. |

#### Examples

Retrieve the status of a package installation request with the specified ID on your default org:

```bash
sf package install report --request-id 0Hf...
```

Similar to previous example, except use the org with username me@example.com:

```bash
sf package install report --request-id 0Hf... --target-org me@example.com
```

#### Aliases

`force:package:install:report`

> *Plugin: @salesforce/plugin-packaging*


### package installed list

**List the org’s installed packages.**

#### Usage

```bash
sf package installed list [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `--loglevel` | string |  |
| `-o, --target-org` | string (required) | Username or alias of the target org. Not required if the `target-org` configuration variable is alre... |
| `--api-version` | string | Override the api version used for api requests made by this command |

#### Examples

List the installed packages in your default org:

```bash
sf package installed list
```

List the installed packages in the org with username me@example.com:

```bash
sf package installed list --target-org me@example.com
```

#### Aliases

`force:package:installed:list`

> *Plugin: @salesforce/plugin-packaging*


### package list

**List all packages in the Dev Hub org.**

Description

#### Usage

```bash
sf package list [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `--loglevel` | string |  |
| `-v, --target-dev-hub` | string (required) | Username or alias of the Dev Hub org. Not required if the `target-dev-hub` configuration variable is... |
| `--api-version` | string | Override the api version used for api requests made by this command |
| `--verbose` | boolean | Display extended package detail. |

#### Examples

List all packages in the specified Dev Hub org:

```bash
sf package list --target-dev-hub devhub@example.com
```

List all packages details in the specified Dev Hub org, and show extended details about each package:

```bash
sf package list --target-dev-hub devhub@example.com --verbose
```

#### Aliases

`force:package:list`

> *Plugin: @salesforce/plugin-packaging*


### package push-upgrade abort

**Abort a package push upgrade that has been scheduled. Only push upgrade requests with a status of Created or Pending can be aborted.**

Specify the request ID that you want to abort. If applicable, the command displays errors related to the request.

To show all requests in the org, run "sf package pushupgrade list --package 033...".

#### Usage

```bash
sf package push-upgrade abort [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `-v, --target-dev-hub` | string (required) | Username or alias of the Dev Hub org. Not required if the `target-dev-hub` configuration variable is... |
| `--api-version` | string | Override the api version used for api requests made by this command |
| `-i, --push-request-id` | string (required) | ID of the package push request (starts with 0DV). This ID is returned after the package push-upgrade... |

#### Examples

Cancel the specified package push upgrade request with the specified ID; uses your default Dev Hub org:

```bash
sf package push-upgrade abort --push-request-id 0DV...
```

Cancel the specified package push upgrade request in the Dev Hub org with username devhub@example.com:

```bash
sf package push-upgrade abort --push-request-id 0DV... --target-dev-hub devhub@example.com
```

> *Plugin: @salesforce/plugin-packaging*


### package push-upgrade list

**Lists the status of push upgrade requests for a given package.**

Shows the details of each request to create a push upgrade in the Dev Hub org.

All filter parameters are applied using the AND logical operator (not OR).

To get information about a specific request, run "sf package pushupgrade report" and supply the request ID.

#### Usage

```bash
sf package push-upgrade list [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `-v, --target-dev-hub` | string (required) | Username or alias of the Dev Hub org. Not required if the `target-dev-hub` configuration variable is... |
| `--api-version` | string | Override the api version used for api requests made by this command |
| `-p, --package` | string (required) | Package ID (starts with 033) of the package that you want push upgrade information for. |
| `-l, --scheduled-last-days` | string | Number of days in the past for which to display the list of push upgrade requests that were schedule... |
| `-s, --status` | string | Status used to filter the list output Valid values are: Created, Canceled, Pending, In Progress, Fai... |
| `--show-push-migrations-only` | boolean | Display only push upgrade requests for package migrations. |

#### Examples

List all package push upgrade requests in the specified Dev Hub org:

```bash
sf package push-upgrade list --package 033xyz --target-dev-hub myHub
```

List all package push upgrade requests in the specified Dev Hub org scheduled in the last 30 days:

```bash
sf package push-upgrade list --package 033xyz --scheduled-last-days 30 --target-dev-hub myHub
```

List all package push upgrade with a status Succeeded:

```bash
sf package push-upgrade list --package 033xyz –-status Succeeded
```

List all package push upgrade with a status Failed:

```bash
sf package push-upgrade list --package 033xyz –-status Failed
```

#### Aliases

`force:package:push-upgrade:list`

> *Plugin: @salesforce/plugin-packaging*


### package push-upgrade report

**Retrieve the status of a package push upgrade.**

Specify the request ID for which you want to view details. If applicable, the command displays errors related to the request.

To show all requests in the org, run "sf package pushupgrade list".

#### Usage

```bash
sf package push-upgrade report [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `--loglevel` | string |  |
| `-v, --target-dev-hub` | string (required) | Username or alias of the Dev Hub org. Not required if the `target-dev-hub` configuration variable is... |
| `--api-version` | string | Override the api version used for api requests made by this command |
| `-i, --push-request-id` | string (required) | ID of the package push request (starts with 0DV). This ID is returned after the package push-upgrade... |

#### Examples

Retrieve details about the package push upgrade with the specified ID; uses your default Dev Hub org:

```bash
sf package push-upgrade report --push-request-id 0DV...
```

Retrieve details about the specified package push request in the Dev Hub org with username devhub@example.com:

```bash
sf package push-upgrade report --push-request-id 0DV... --target-dev-hub devhub@example.com
```

#### Aliases

`force:package:push-upgrade:report`

> *Plugin: @salesforce/plugin-packaging*


### package push-upgrade schedule

**Schedule a package push upgrade.**

Represents a push upgrade request for upgrading a package in one or many orgs from one version to another version.
To initiate a push upgrade for an unlocked or second-generation managed package, the Create and Update Second-Generation Packages user permission is required.
For second-generation managed packages, the push upgrade feature is available only for packages that have passed AppExchange security review. To enable push upgrades for your managed package, log a support case in the Salesforce Partner Community.
For unlocked packages, push upgrades are enabled by default.

Use the -–migrate-to-2GP flag to indicate you’re installing a converted second-generation managed package into an org that has the first-generation managed package version of that package installed.

#### Usage

```bash
sf package push-upgrade schedule [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `-v, --target-dev-hub` | string (required) | Username or alias of the Dev Hub org that owns the package. |
| `--api-version` | string | Override the api version used for api requests made by this command |
| `-p, --package` | string (required) | ID (starts with 04t) of the package version that the package is being upgraded to. The package versi... |
| `-t, --start-time` | string | Date and time (UTC) when the push upgrade is processed. Set to the earliest time that you want Sales... |
| `-l, --org-list` | string | Comma-separated list of subscriber org IDs that need the package upgrade. Either --org-list or --org... |
| `-f, --org-file` | string | Filename of the CSV file that contains the list of subscriber org IDs that need the package upgrade.... |
| `--migrate-to-2gp` | boolean | Upgrade from a first-generation managed package (1GP) to a second-generation managed package (2GP). ... |

#### Examples

Schedule a push upgrade that initiates at a specified time:

```bash
sf package push-upgrade schedule --package 04txyz --start-time "2024-12-06T21:00:00" --org-file upgrade-orgs.csv --target-dev-hub myHub
```

Schedule a push upgrade that initiates as soon as possible:

```bash
sf package push-upgrade schedule --package 04txyz --org-file upgrade-orgs.csv --target-dev-hub myHub
```

Schedule a push migration from a 1GP package to a 2GP package:

```bash
sf package push-upgrade schedule --migrate-to-2gp --package 04txyz --start-time "2024-12-06T21:00:00" --org-file upgrade-orgs.csv --target-dev-hub myHub
```

> *Plugin: @salesforce/plugin-packaging*


### package uninstall

**Uninstall a second-generation package from the target org.**

Specify the package ID for a second-generation package.

To list the org’s installed packages, run "sf package installed list".

To uninstall a first-generation package, from Setup, enter Installed Packages in the Quick Find box, then select Installed Packages.

#### Usage

```bash
sf package uninstall [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `--loglevel` | string |  |
| `-o, --target-org` | string (required) | Username or alias of the target org. Not required if the `target-org` configuration variable is alre... |
| `--api-version` | string | Override the api version used for api requests made by this command |
| `-w, --wait` | string | Number of minutes to wait for uninstall status. |
| `-p, --package` | string (required) | ID (starts with 04t) or alias of the package version to uninstall. |

#### Examples

Uninstall a package with specified ID from an org with username me@example.com:

```bash
sf package uninstall --package 04t... --target-org me@example.com
```

Uninstall a package with the specified alias from your default org:

```bash
sf package uninstall --package undesirable_package_alias
```

Uninstall a package with an alias that contains spaces from your default org:

```bash
sf package uninstall --package "Undesirable Package Alias"
```

#### Aliases

`force:package:uninstall`

> *Plugin: @salesforce/plugin-packaging*


### package uninstall report

**Retrieve the status of a package uninstall request.**

#### Usage

```bash
sf package uninstall report [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `--loglevel` | string |  |
| `-o, --target-org` | string (required) | Username or alias of the target org. Not required if the `target-org` configuration variable is alre... |
| `--api-version` | string | Override the api version used for api requests made by this command |
| `-i, --request-id` | string (required) | ID of the package uninstall request you want to check; starts with 06y. |

#### Examples

Retrieve the status of a package uninstall in your default org using the specified request ID:

```bash
sf package uninstall report --request-id 06y...
```

Similar to previous example, but use the org with username me@example.com:

```bash
sf package uninstall report --request-id 06y... --target-org me@example.com
```

#### Aliases

`force:package:uninstall:report`

> *Plugin: @salesforce/plugin-packaging*


### package update

**Update package details.**

Specify a new value for each option you want to update.

Run "sf package list" to list all packages in the Dev Hub org.

#### Usage

```bash
sf package update [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `--loglevel` | string |  |
| `-v, --target-dev-hub` | string (required) | Username or alias of the Dev Hub org. Not required if the `target-dev-hub` configuration variable is... |
| `--api-version` | string | Override the api version used for api requests made by this command |
| `-p, --package` | string (required) | ID (starts with 0Ho) or alias of the package to update. |
| `-n, --name` | string | New name of the package. |
| `-d, --description` | string | New description of the package. |
| `-o, --error-notification-username` | string | Active Dev Hub user designated to receive email notifications for package errors. |
| `--enable-app-analytics` | boolean | Enable AppExchange App Analytics usage data collection on this managed package and its components. |
| `-r, --recommended-version-id` | string | Package version ID that subscribers are notified to install or upgrade to. |
| `--skip-ancestor-check` | boolean | Bypass the ancestry check for setting a recommended version. |

#### Examples

Update the name of the package with the specified alias; uses your default Dev Hub org:

```bash
sf package update --package "Your Package Alias" --name "New Package Name"
```

Update the description of the package with the specified ID; uses the specified Dev Hub org:

```bash
sf package update --package 0Ho... --description "New Package Description" --target-dev-hub devhub@example.com
```

#### Aliases

`force:package:update`

> *Plugin: @salesforce/plugin-packaging*


### package version create

**Create a package version in the Dev Hub org.**

The package version is based on the package contents in the specified directory.

To retrieve details about a package version create request, including status and package version ID (04t), run "sf package version create report -i 08c...".

We recommend that you specify the --installation-key parameter to protect the contents of your package and to prevent unauthorized installation of your package.

To list package version creation requests in the org, run "sf package version create list".
To promote a package version to released, you must use the --code-coverage parameter. The package must also meet the code coverage requirements. This requirement applies to both managed and unlocked packages.

We don’t calculate code coverage for org-dependent unlocked packages, or for package versions that specify --skip-validation.

#### Usage

```bash
sf package version create [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `--loglevel` | string |  |
| `-v, --target-dev-hub` | string (required) | Username or alias of the Dev Hub org. Not required if the `target-dev-hub` configuration variable is... |
| `--api-version` | string | Override the api version used for api requests made by this command |
| `-b, --branch` | string | Name of the branch in your source control system that the package version is based on. |
| `-s, --build-instance` | string | Instance where the package version will be created, such as NA50. |
| `-c, --code-coverage` | boolean | Calculate and store the code coverage percentage by running the packaged Apex tests included in this... |
| `-f, --definition-file` | string | Path to a definition file similar to scratch org definition file that contains the list of features ... |
| `-k, --installation-key` | string | Installation key for key-protected package. (either --installation-key or --installation-key-bypass ... |
| `-x, --installation-key-bypass` | boolean | Bypass the installation key requirement. (either --installation-key or --installation-key-bypass is ... |
| `-p, --package` | string | ID (starts with 0Ho) or alias of the package to create a version of. |
| `-d, --path` | string | Path to the directory that contains the contents of the package. |
| `--post-install-script` | string | Name of the post-install script; applies to managed packages only. |
| `--post-install-url` | string | Post-install instructions URL. |
| `-r, --preserve` | boolean | Preserve temp files that would otherwise be deleted. |
| `--releasenotes-url` | string | Release notes URL. |
| `--skip-ancestor-check` | boolean | Overrides ancestry requirements, which allows you to specify a package ancestor that isn’t the highe... |
| `--skip-validation` | boolean | Skip validation during package version creation; you can’t promote unvalidated package versions. |
| `--async-validation` | boolean | Return a new package version before completing package validations. |
| `-t, --tag` | string | Package version’s tag. |
| `--uninstall-script` | string | Uninstall script name; applies to managed packages only. |
| `-j, --validate-schema` | boolean | Validate the sfdx-project.json file against the JSON schema. |
| `-e, --version-description` | string | Description of the package version to be created; overrides the sfdx-project.json value. |
| `-a, --version-name` | string | Name of the package version to be created; overrides the sfdx-project.json value. |
| `-n, --version-number` | string | Version number of the package version to be created; overrides the sfdx-project.json value. |
| `-w, --wait` | string | Number of minutes to wait for the package version to be created. |
| `--language` | string | Language for the package. |
| `--verbose` | boolean | Display verbose command output. |

#### Examples

Create a package version from the contents of the "common" directory and give it an installation key of "password123"; uses your default Dev Hub org:

```bash
sf package version create --path common --installation-key password123
```

Create a package version from a package with the specified alias; uses the Dev Hub org with username devhub@example.com:

```bash
sf package version create --package "Your Package Alias" --installation-key password123 --target-dev-hub devhub@example.com
```

Create a package version from a package with the specified ID:

```bash
sf package version create --package 0Ho... --installation-key password123
```

Create a package version and skip the validation step:

```bash
sf package version create --path common --installation-key password123 --skip-validation
```

Create a package version and perform package validations asynchronously:

```bash
sf package version create --path common --installation-key password123 --async-validation
```

#### Aliases

`force:package:version:create`

> *Plugin: @salesforce/plugin-packaging*


### package version create list

**List package version creation requests.**

Shows the details of each request to create a package version in the Dev Hub org.

All filter parameters are applied using the AND logical operator (not OR).

To get information about a specific request, run "sf package version create report" and supply the request ID.

#### Usage

```bash
sf package version create list [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `--loglevel` | string |  |
| `-v, --target-dev-hub` | string (required) | Username or alias of the Dev Hub org. Not required if the `target-dev-hub` configuration variable is... |
| `--api-version` | string | Override the api version used for api requests made by this command |
| `-c, --created-last-days` | string | Number of days since the request was created, starting at 00:00:00 of first day to now. Use 0 for to... |
| `-s, --status` | string | Status of the version creation request, used to filter the list. |
| `--show-conversions-only` | boolean | Filter the list output to display only converted package version. |
| `--verbose` | boolean | Displays additional information at a slight performance cost, such as the version name and number fo... |

#### Examples

List all package version creation requests in your default Dev Hub org:

```bash
sf package version create list
```

List package version creation requests from the last 3 days in the Dev Hub org with username devhub@example.com:

```bash
sf package version create list --created-last-days 3 --target-dev-hub
```

List package version creation requests with status Error:

```bash
sf package version create list --status Error
```

List package version creation requests with status InProgress:

```bash
sf package version create list --status InProgress
```

List package version creation requests with status Success that were created today:

```bash
sf package version create list --created-last-days 0 --status Success
```

#### Aliases

`force:package:version:create:list`

> *Plugin: @salesforce/plugin-packaging*


### package version create report

**Retrieve details about a package version creation request.**

Specify the request ID for which you want to view details. If applicable, the command displays errors related to the request.

To show all requests in the org, run "sf package version create list".

#### Usage

```bash
sf package version create report [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `--loglevel` | string |  |
| `-v, --target-dev-hub` | string (required) | Username or alias of the Dev Hub org. Not required if the `target-dev-hub` configuration variable is... |
| `--api-version` | string | Override the api version used for api requests made by this command |
| `-i, --package-create-request-id` | string (required) | ID (starts with 08c) of the package version creation request you want to display. |

#### Examples

Retrieve details about the package version creation request with the specified ID; uses your default Dev Hub org:

```bash
sf package version create report --package-create-request-id 08c...
```

Retrieve details about the specified package version creation request in the Dev Hub org with username devhub@example.com:

```bash
sf package version create report --package-create-request-id 08c... --target-dev-hub devhub@example.com
```

#### Aliases

`force:package:version:create:report`

> *Plugin: @salesforce/plugin-packaging*


### package version delete

**Delete a package version.**

Specify the ID or alias of the package version you want to delete. In second-generation managed packaging, only beta package versions can be deleted. Before deleting a package version, review the considerations outlined in https://developer.salesforce.com/docs/atlas.en-us.pkg2_dev.meta/pkg2_dev/sfdx_dev_dev2gp_package_deletion.htm.

#### Usage

```bash
sf package version delete [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `--loglevel` | string |  |
| `-v, --target-dev-hub` | string (required) | Username or alias of the Dev Hub org. Not required if the `target-dev-hub` configuration variable is... |
| `--api-version` | string | Override the api version used for api requests made by this command |
| `-n, --no-prompt` | boolean | Don’t prompt before deleting the package version. |
| `-p, --package` | string (required) | ID (starts with 04t) or alias of the package version to delete. |
| `--undelete` | boolean | Undelete a deleted package version. |

#### Examples

Delete a package version with the specified alias using your default Dev Hub org:

```bash
sf package version delete --package "Your Package Alias"
```

Delete a package version with the specified ID using the Dev Hub org with username "devhub@example.com":

```bash
sf package version delete --package 04t... --target-org devhub@example.com
```

#### Aliases

`force:package:version:delete`

> *Plugin: @salesforce/plugin-packaging*


### package version displayancestry

**Display the ancestry tree for a 2GP managed package version.**

#### Usage

```bash
sf package version displayancestry [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `--loglevel` | string |  |
| `-v, --target-dev-hub` | string (required) | Username or alias of the Dev Hub org. Not required if the `target-dev-hub` configuration variable is... |
| `--api-version` | string | Override the api version used for api requests made by this command |
| `-p, --package` | string (required) | ID or alias of the package (starts with 0Ho) or package version (starts with 04t) to display ancestr... |
| `--dot-code` | boolean | Display the ancestry tree in DOT code. |
| `--verbose` | boolean | Display both the package version ID (starts with 04t) and the version number (major.minor.patch.buil... |

#### Examples

Display the ancestry tree for a package version with the specified alias, using your default Dev Hub org:

```bash
sf package version displayancestry --package package_version_alias
```

Similar to previous example, but display the output in DOT code:

```bash
sf package version displayancestry --package package_version_alias --dot-code
```

Display the ancestry tree for a package with the specified ID, using the Dev Hub org with username devhub@example.com:

```bash
sf package version displayancestry --package OHo... --target-dev-hub devhub@example.com
```

Display the ancestry tree of a package version with the specified ID, using your default Dev Hub org:

```bash
sf package version displayancestry --package 04t...
```

#### Aliases

`force:package:version:displayancestry`

> *Plugin: @salesforce/plugin-packaging*


### package version displaydependencies

**Display the dependency graph for an unlocked or 2GP managed package version.**

#### Usage

```bash
sf package version displaydependencies [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `--loglevel` | string |  |
| `-v, --target-dev-hub` | string (required) | Username or alias of the Dev Hub org. Not required if the `target-dev-hub` configuration variable is... |
| `--api-version` | string | Override the api version used for api requests made by this command |
| `-p, --package` | string (required) | ID or alias of the package version (starts with 04t) or the package version create request (starts w... |
| `--edge-direction` | string | Order (root-first or root-last) in which the dependencies are displayed. |
| `--verbose` | boolean | Display both the package version ID (starts with 04t) and the version number (major.minor.patch.buil... |

#### Examples

Display the dependency graph for a package version with the specified alias, using your default Dev Hub org and the default edge-direction:

```bash
sf package version displaydependencies --package package_version_alias
```

Display the dependency graph for a package version with the specified ID and display the graph using a root-last edge direction. Use the Dev Hub org with username devhub@example.com:

```bash
sf package version displaydependencies --package 04t... --edge-direction root-last --target-dev-hub devhub@example.com
```

Display the dependency graph of a version create request with the specified ID, using your default Dev Hub org and the default edge-direction:

```bash
sf package version displaydependencies --package 08c...
```

> *Plugin: @salesforce/plugin-packaging*


### package version list

**List all package versions in the Dev Hub org.**

Description

#### Usage

```bash
sf package version list [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `--loglevel` | string |  |
| `-v, --target-dev-hub` | string (required) | Username or alias of the Dev Hub org. Not required if the `target-dev-hub` configuration variable is... |
| `--api-version` | string | Override the api version used for api requests made by this command |
| `-c, --created-last-days` | string | Number of days since the request was created, starting at 00:00:00 of first day to now. Use 0 for to... |
| `--concise` | boolean | Display limited package version details. |
| `--show-conversions-only` | boolean | Filter the list output to display only converted package version. |
| `-m, --modified-last-days` | string | Number of days since the items were modified, starting at 00:00:00 of first day to now. Use 0 for to... |
| `-p, --packages` | string | Comma-delimited list of packages (aliases or 0Ho IDs) to list. |
| `-r, --released` | boolean | Display released versions only (IsReleased=true). |
| `-b, --branch` | string | Branch in your source control system used to filter the results; only package versions based on the ... |
| `-o, --order-by` | string | Package version fields used to order the list. |
| `--verbose` | boolean | Display extended package version details. |

#### Examples

List package versions in your default Dev Hub org that were created in the last 3 days; show only the released versions and order the list using the PatchVersion field. Display extended details about each package version:

```bash
sf package version list --verbose --created-last-days 3 --released --order-by PatchVersion
```

List the released package versions for the two specified packages that were modified today; use the Dev Hub org with username devhub@example.com:

```bash
sf package version list --packages 0Ho000000000000,0Ho000000000001 --released --modified-last-days 0 --target-dev-hub devhub@example.com
```

List all released package versions in your default Dev Hub org:

```bash
sf package version list --released
```

List package versions that were modified today in your default Dev Hub org; show limited details about each one:

```bash
sf package version list --concise --modified-last-days 0
```

List package versions that are based on the "featureA" branch in your source control system that were modified today in your default Dev Hub org; show limited details about each one:

```bash
sf package version list --concise --modified-last-days 0 --branch featureA
```

List released package versions that were created in the last 3 days in your default Dev Hub org; show limited details:

```bash
sf package version list --concise --created-last-days 3 --released
```

List released package versions that were modified today for the two packages with specified aliases in your default Dev Hub org:

```bash
sf package version list --packages exp-mgr,exp-mgr-util --released --modified-last-days 0
```

#### Aliases

`force:package:version:list`

> *Plugin: @salesforce/plugin-packaging*


### package version promote

**Promote a package version to released.**

Supply the ID or alias of the package version you want to promote. Promotes the package version to released status.

#### Usage

```bash
sf package version promote [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `--loglevel` | string |  |
| `-v, --target-dev-hub` | string (required) | Username or alias of the Dev Hub org. Not required if the `target-dev-hub` configuration variable is... |
| `--api-version` | string | Override the api version used for api requests made by this command |
| `-p, --package` | string (required) | ID (starts with 04t) or alias of the package version to promote. |
| `-n, --no-prompt` | boolean | Don't prompt to confirm setting the package version as released. |

#### Examples

Promote the package version with the specified ID to released; uses your default Dev Hub org:

```bash
sf package version promote --package 04t...
```

Promote the package version with the specified alias to released; uses the Dev Hub org with username devhub@example.com:

```bash
sf package version promote --package awesome_package_alias --target-dev-hub devhub@example.com
```

Promote the package version with an alias that has spaces to released:

```bash
sf package version promote --package "Awesome Package Alias"
```

#### Aliases

`force:package:version:promote`

> *Plugin: @salesforce/plugin-packaging*


### package version report

**Retrieve details about a package version in the Dev Hub org.**

To update package version values, run "sf package version update".

#### Usage

```bash
sf package version report [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `--loglevel` | string |  |
| `-v, --target-dev-hub` | string (required) | Username or alias of the Dev Hub org. Not required if the `target-dev-hub` configuration variable is... |
| `--api-version` | string | Override the api version used for api requests made by this command |
| `-p, --package` | string (required) | ID (starts with 04t) or alias of the package to retrieve details for. |
| `--verbose` | boolean | Display extended package version details. |

#### Examples

Retrieve details about the package version with the specified ID from your default Dev Hub org:

```bash
sf package version report --package 04t...
```

Retrieve details about the package version with the specified alias (that contains spaces) from the Dev Hub org with username devhub@example.com:

```bash
sf package version report --package "Your Package Alias" --target-dev-hub devhub@example.com
```

#### Aliases

`force:package:version:report`

> *Plugin: @salesforce/plugin-packaging*


### package version retrieve

**Retrieve package metadata for a specified package version. Package metadata can be retrieved for only second-generation managed package versions or unlocked packages.**

Retrieving a package version downloads the metadata into the directory you specify.

When you run this command, specify the subscriber package version ID (starts with 04t) and the path to an empty directory.

By default, the package version retrieve command is available to 2GP managed packages that were converted from 1GP. To use this command with a managed package created using 2GP (not converted from 1GP) or with an unlocked package, specify IsDevUsePkgZipRequested = true in the Package2VersionCreateRequest Tooling API object. If you run this command and the zip folder with the package version’s source files is missing, confirm that IsDevUsePkgZipRequested is set to true.

#### Usage

```bash
sf package version retrieve [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `--loglevel` | string |  |
| `--api-version` | string | Override the api version used for api requests made by this command |
| `-v, --target-dev-hub` | string (required) | Username or alias of the Dev Hub org. Not required if the `target-dev-hub` configuration variable is... |
| `-p, --package` | string (required) | Subscriber package version ID (starts with 04t). |
| `-d, --output-dir` | string | Path within your Salesforce DX project directory in which to download the metadata. This directory m... |

#### Examples

Retrieve package metadata for a converted subscriber package version ID (starts with 04t) into my-directory/ within your Salesforce DX project directory:

```bash
sf package version retrieve --package 04tXXX --output-dir my-directory/ --target-dev-hub devhub@example.com
```

> *Plugin: @salesforce/plugin-packaging*


### package version update

**Update a package version.**

Specify a new value for each option you want to update.

To display details about a package version, run "sf package version display".

#### Usage

```bash
sf package version update [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `--loglevel` | string |  |
| `-v, --target-dev-hub` | string (required) | Username or alias of the Dev Hub org. Not required if the `target-dev-hub` configuration variable is... |
| `--api-version` | string | Override the api version used for api requests made by this command |
| `-p, --package` | string (required) | ID (starts with 04t) or alias of the package to update a version of. |
| `-a, --version-name` | string | New package version name. |
| `-e, --version-description` | string | New package version description. |
| `-b, --branch` | string | New package version branch. |
| `-t, --tag` | string | New package version tag. |
| `-k, --installation-key` | string | New installation key for key-protected package (default: null) |

#### Examples

Update the package version that has the specified alias (that contains spaces) with a new installation key "password123"; uses your default Dev Hub org:

```bash
sf package version update --package "Your Package Alias" --installation-key password123
```

Update the package version that has the specified ID with a new branch and tag; use the Dev Hub org with username devhub@example.com:

```bash
sf package version update --package 04t... --branch main --tag 'Release 1.0.7' --target-dev-hub devhub@example.com
```

Update the package version that has the specified ID with a new description:

```bash
sf package version update --package 04t... --version-description "New Package Version Description"
```

#### Aliases

`force:package:version:update`

> *Plugin: @salesforce/plugin-packaging*


---

## package1

*4 commands in this topic*

### package1 version create

**Create a first-generation package version in the release org.**

The package version is based on the contents of the specified metadata package. Omit --managed-released if you want to create an unmanaged package version.

#### Usage

```bash
sf package1 version create [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `--loglevel` | string |  |
| `-o, --target-org` | string (required) | Username or alias of the target org. Not required if the `target-org` configuration variable is alre... |
| `--api-version` | string | Override the api version used for api requests made by this command |
| `-i, --package-id` | string (required) | ID of the metadata package (starts with 033) of which you’re creating a new version. |
| `-n, --name` | string (required) | Package version name. |
| `-d, --description` | string | Package version description. |
| `-v, --version` | string | Package version in major.minor format, for example, 3.2. |
| `-m, --managed-released` | boolean | Create a managed package version. |
| `-r, --release-notes-url` | string | Release notes URL. |
| `-p, --post-install-url` | string | Post install URL. |
| `-k, --installation-key` | string | Installation key for key-protected package (default: null). |
| `-w, --wait` | string | Minutes to wait for the package version to be created (default: 2 minutes). |

#### Examples

Create a first-generation package version from the package with the specified ID and name the package version "example"; use your default org:

```bash
sf package1 version create --package-id 033... --name example
```

Same as previous example, but provide a description and wait for 30 minutes for the package version to be created; use the specified org:

```bash
sf package1 version create --package-id 033... --name example --description "example description" --wait 30 --target-org myorg@example.com
```

#### Aliases

`force:package1:version:create`

> *Plugin: @salesforce/plugin-packaging*


### package1 version create get

**Retrieve the status of a package version creation request.**

#### Usage

```bash
sf package1 version create get [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `--loglevel` | string |  |
| `-o, --target-org` | string (required) | Username or alias of the target org. Not required if the `target-org` configuration variable is alre... |
| `--api-version` | string | Override the api version used for api requests made by this command |
| `-i, --request-id` | string (required) | ID of the PackageUploadRequest (starts with 0HD). |

#### Examples

Get the status of the creation request for the package version with the specified ID in your default org:

```bash
sf package1 version create get --request-id 0HD...
```

Same as previous example, but use the specified org:

```bash
sf package1 version create get --request-id 0HD... --target-org myorg@example.com
```

#### Aliases

`force:package1:version:create:get`

> *Plugin: @salesforce/plugin-packaging*


### package1 version display

**Display details about a first-generation package version.**

#### Usage

```bash
sf package1 version display [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `--loglevel` | string |  |
| `-o, --target-org` | string (required) | Username or alias of the target org. Not required if the `target-org` configuration variable is alre... |
| `--api-version` | string | Override the api version used for api requests made by this command |
| `-i, --package-version-id` | string (required) | ID (starts with 04t) of the metadata package version whose details you want to display. |

#### Examples

Display details about the first-generation package version with the specified ID in your default org:

```bash
sf package1 version display --package-version-id 04t...
```

Same as previous example, but use the specified org:

```bash
sf package1 version display --package-version-id 04t... --target-org myorg@example.com
```

#### Aliases

`force:package1:version:display`

> *Plugin: @salesforce/plugin-packaging*


### package1 version list

**List package versions for the specified first-generation package or for the org.**

#### Usage

```bash
sf package1 version list [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `--loglevel` | string |  |
| `-o, --target-org` | string (required) | Username or alias of the target org. Not required if the `target-org` configuration variable is alre... |
| `--api-version` | string | Override the api version used for api requests made by this command |
| `-i, --package-id` | string | Metadata package ID (starts with 033) whose package versions you want to list. |

#### Examples

List all first-generation package versions in your default org:

```bash
sf package1 version list
```

List package versions for the specified first-generation package in the specifief org:

```bash
sf package1 version list --package-id 033... --target-org myorg@example.com
```

#### Aliases

`force:package1:version:list`

> *Plugin: @salesforce/plugin-packaging*


---

## plugins

*12 commands in this topic*

### plugins

List installed plugins.

#### Usage

```bash
sf plugins [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--core` | boolean | Show core plugins. |

#### Examples

```bash
sf plugins
```

> *Plugin: @oclif/plugin-plugins*


### plugins add

**Installs a plugin into sf.**

Uses npm to install plugins.

Installation of a user-installed plugin will override a core plugin.

Use the SF_NPM_LOG_LEVEL environment variable to set the npm loglevel.
Use the SF_NPM_REGISTRY environment variable to set the npm registry.

#### Usage

```bash
sf plugins add [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `-f, --force` | boolean | Force npm to fetch remote resources even if a local copy exists on disk. |
| `-h, --help` | boolean | Show CLI help. |
| `--jit` | boolean |  |
| `-s, --silent` | boolean | Silences npm output. |
| `-v, --verbose` | boolean | Show verbose npm output. |

#### Arguments

| Argument | Description |
|----------|-------------|
| `plugin` | Plugin to install. (required) |

#### Examples

```bash
{"command":"sf plugins add <%- config.pjson.oclif.examplePlugin || \"myplugin\" %> ","description":"Install a plugin from npm registry."}
```

```bash
{"command":"sf plugins add https://github.com/someuser/someplugin","description":"Install a plugin from a github url."}
```

```bash
{"command":"sf plugins add someuser/someplugin","description":"Install a plugin from a github slug."}
```

#### Aliases

`plugins:add`

> *Plugin: @oclif/plugin-plugins*


### plugins discover

**See a list of 3rd-party sf plugins you can install.**

#### Usage

```bash
sf plugins discover [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |

#### Examples

```bash
sf plugins discover
```

> *Plugin: @salesforce/plugin-marketplace*


### plugins inspect

Displays installation properties of a plugin.

#### Usage

```bash
sf plugins inspect [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `-h, --help` | boolean | Show CLI help. |
| `-v, --verbose` | boolean |  |

#### Arguments

| Argument | Description |
|----------|-------------|
| `plugin` | Plugin to inspect. (required) |

#### Examples

```bash
sf plugins inspect <%- config.pjson.oclif.examplePlugin || "myplugin" %>
```

> *Plugin: @oclif/plugin-plugins*


### plugins install

**Installs a plugin into sf.**

Uses npm to install plugins.

Installation of a user-installed plugin will override a core plugin.

Use the SF_NPM_LOG_LEVEL environment variable to set the npm loglevel.
Use the SF_NPM_REGISTRY environment variable to set the npm registry.

#### Usage

```bash
sf plugins install [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `-f, --force` | boolean | Force npm to fetch remote resources even if a local copy exists on disk. |
| `-h, --help` | boolean | Show CLI help. |
| `--jit` | boolean |  |
| `-s, --silent` | boolean | Silences npm output. |
| `-v, --verbose` | boolean | Show verbose npm output. |

#### Arguments

| Argument | Description |
|----------|-------------|
| `plugin` | Plugin to install. (required) |

#### Examples

```bash
{"command":"sf plugins install <%- config.pjson.oclif.examplePlugin || \"myplugin\" %> ","description":"Install a plugin from npm registry."}
```

```bash
{"command":"sf plugins install https://github.com/someuser/someplugin","description":"Install a plugin from a github url."}
```

```bash
{"command":"sf plugins install someuser/someplugin","description":"Install a plugin from a github slug."}
```

#### Aliases

`plugins:add`

> *Plugin: @oclif/plugin-plugins*


### plugins link

**Links a plugin into the CLI for development.**

Installation of a linked plugin will override a user-installed or core plugin.

e.g. If you have a user-installed or core plugin that has a 'hello' command, installing a linked plugin with a 'hello' command will override the user-installed or core plugin implementation. This is useful for development work.


#### Usage

```bash
sf plugins link [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `-h, --help` | boolean | Show CLI help. |
| `--install` | boolean | Install dependencies after linking the plugin. |
| `-v, --verbose` | boolean |  |

#### Arguments

| Argument | Description |
|----------|-------------|
| `path` | path to plugin (required) |

#### Examples

```bash
sf plugins link <%- config.pjson.oclif.examplePlugin || "myplugin" %>
```

> *Plugin: @oclif/plugin-plugins*


### plugins remove

Removes a plugin from the CLI.

#### Usage

```bash
sf plugins remove [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `-h, --help` | boolean | Show CLI help. |
| `-v, --verbose` | boolean |  |

#### Arguments

| Argument | Description |
|----------|-------------|
| `plugin` | plugin to uninstall |

#### Examples

```bash
sf plugins remove <%- config.pjson.oclif.examplePlugin || "myplugin" %>
```

#### Aliases

`plugins:unlink`, `plugins:remove`

> *Plugin: @oclif/plugin-plugins*


### plugins reset

**Remove all user-installed and linked plugins.**

#### Usage

```bash
sf plugins reset [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--hard` | boolean | Delete node_modules and package manager related files in addition to uninstalling plugins. |
| `--reinstall` | boolean | Reinstall all plugins after uninstalling. |

> *Plugin: @oclif/plugin-plugins*


### plugins trust verify

**Validate a digital signature.**

Verifies the digital signature on an npm package matches the signature and key stored at the expected URLs.

#### Usage

```bash
sf plugins trust verify [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `-n, --npm` | string (required) | Specify the npm name. This can include a tag/version. |
| `-r, --registry` | string | The registry name. The behavior is the same as npm. |
| `--loglevel` | string |  |

#### Examples

```bash
sf plugins trust verify --npm @scope/npmName --registry https://npm.pkg.github.com
```

```bash
sf plugins trust verify --npm @scope/npmName
```

> *Plugin: @salesforce/plugin-trust*


### plugins uninstall

Removes a plugin from the CLI.

#### Usage

```bash
sf plugins uninstall [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `-h, --help` | boolean | Show CLI help. |
| `-v, --verbose` | boolean |  |

#### Arguments

| Argument | Description |
|----------|-------------|
| `plugin` | plugin to uninstall |

#### Examples

```bash
sf plugins uninstall <%- config.pjson.oclif.examplePlugin || "myplugin" %>
```

#### Aliases

`plugins:unlink`, `plugins:remove`

> *Plugin: @oclif/plugin-plugins*


### plugins unlink

Removes a plugin from the CLI.

#### Usage

```bash
sf plugins unlink [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `-h, --help` | boolean | Show CLI help. |
| `-v, --verbose` | boolean |  |

#### Arguments

| Argument | Description |
|----------|-------------|
| `plugin` | plugin to uninstall |

#### Examples

```bash
sf plugins unlink <%- config.pjson.oclif.examplePlugin || "myplugin" %>
```

#### Aliases

`plugins:unlink`, `plugins:remove`

> *Plugin: @oclif/plugin-plugins*


### plugins update

Update installed plugins.

#### Usage

```bash
sf plugins update [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `-h, --help` | boolean | Show CLI help. |
| `-v, --verbose` | boolean |  |

> *Plugin: @oclif/plugin-plugins*


---

## project

*23 commands in this topic*

### project convert mdapi

**Convert metadata retrieved via Metadata API into the source format used in Salesforce DX projects.**

To use Salesforce CLI to work with components that you retrieved via Metadata API, first convert your files from the metadata format to the source format using this command.

To convert files from the source format back to the metadata format, run "sf project convert source".

To convert multiple metadata components, either set multiple --metadata <name> flags or a single --metadata flag with multiple names separated by spaces. Enclose names that contain spaces in one set of double quotes. The same syntax applies to --source-dir.

#### Usage

```bash
sf project convert mdapi [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `--api-version` | string | Override the api version used for api requests made by this command |
| `--loglevel` | string |  |
| `-r, --root-dir` | string (required) | Root directory that contains the Metadata API–formatted metadata. |
| `-d, --output-dir` | string | Directory to store your files in after they’re converted to source format; can be an absolute or rel... |
| `-x, --manifest` | string | File path to manifest (package.xml) of metadata types to convert. |
| `-p, --metadata-dir` | string | Root of directory or zip file of metadata formatted files to convert. |
| `-m, --metadata` | string | Metadata component names to convert. |

#### Examples

Convert metadata formatted files in the specified directory into source formatted files; writes converted files to your default package directory:

```bash
$ sf project convert mdapi --root-dir path/to/metadata
```

Similar to previous example, but writes converted files to the specified output directory:

```bash
$ sf project convert mdapi --root-dir path/to/metadata --output-dir path/to/outputdir
```

#### Aliases

`force:mdapi:convert`

> *Plugin: @salesforce/plugin-deploy-retrieve*


### project convert source

**Convert source-formatted files into metadata that you can deploy using Metadata API.**

To convert source-formatted files into the metadata format, so that you can deploy them using Metadata API, run this command. Then deploy the metadata using "sf project deploy".

To convert Metadata API–formatted files into the source format, run "sf project convert mdapi".

To specify a package name that includes spaces, enclose the name in single quotes.

To convert multiple components, either set multiple --metadata <name> flags or a single --metadata flag with multiple names separated by spaces. Enclose names that contain spaces in one set of double quotes. The same syntax applies to --source-dir.

#### Usage

```bash
sf project convert source [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `--api-version` | string | API Version to use in the generated project's manifest. By default, will use the version from sfdx-p... |
| `--loglevel` | string |  |
| `-r, --root-dir` | string | Source directory other than the default package to convert. |
| `-d, --output-dir` | string | Output directory to store the Metadata API–formatted files in. |
| `-n, --package-name` | string | Name of the package to associate with the metadata-formatted files. |
| `-x, --manifest` | string | Path to the manifest (package.xml) file that specifies the metadata types to convert. |
| `-p, --source-dir` | string | Paths to the local source files to convert. |
| `-m, --metadata` | string | Metadata component names to convert. |

#### Examples

Convert source-formatted files in the specified directory into metadata-formatted files; writes converted files into a new directory:

```bash
$ sf project convert source --root-dir path/to/source
```

Similar to previous example, but writes converted files to the specified output directory and associates the files with the specified package:

```bash
$ sf project convert source --root-dir path/to/source --output-dir path/to/outputdir --package-name 'My Package'
```

#### Aliases

`force:source:convert`

> *Plugin: @salesforce/plugin-deploy-retrieve*


### project convert source-behavior

**Enable a behavior of your project source files, and then update your Salesforce DX project to implement the behavior.**

Specifically, this command updates the "sourceBehaviorOption" option in the "sfdx-project.json" file and then converts the associated local source files in your project as needed.

For example, run this command with the "--behavior decomposePermissionSetBeta" flag to start decomposing permission sets when you deploy or retrieve them. Decomposing means breaking up the monolithic metadata API format XML file that corresponds to a metadata component into smaller XML files and directories based on its subtypes. Permission sets are not decomposed by default; you must opt-in to start decomposing them by using this command. When the command finishes, your "sfdx-project.json" file is updated to always decompose permission sets, and the existing permission set files in your local package directories are converted into the new decomposed format. You run this command only once for a given behavior change.

For more information about the possible values for the --behavior flag, see the "sourceBehaviorOptions" section in the https://developer.salesforce.com/docs/atlas.en-us.sfdx_dev.meta/sfdx_dev/sfdx_dev_ws_config.htm topic.

#### Usage

```bash
sf project convert source-behavior [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `-b, --behavior` | string (required) | Behavior to enable; the values correspond to the possible values of the "sourceBehaviorOption" optio... |
| `--dry-run` | boolean | Display what the command would do, but don't make any actual changes. |
| `--preserve-temp-dir` | boolean | Don't delete the metadata API format temporary directory that this command creates. Useful for debug... |
| `-o, --target-org` | string | Username or alias of the target org. |

#### Examples

Update your Salesforce DX project to decompose custom permission sets:

```bash
sf project convert source-behavior --behavior decomposePermissionSetBeta
```

Display what the command would do, but don't change any existing files:

```bash
sf project convert source-behavior --behavior decomposePermissionSetBeta --dry-run
```

Keep the temporary directory that contains the interim metadata API formatted files:

```bash
sf project convert source-behavior --behavior decomposePermissionSetBeta --dry-run --preserve-temp-dir
```

> *Plugin: @salesforce/plugin-deploy-retrieve*


### project delete source

**Delete source from your project and from a non-source-tracked org.**

Use this command to delete components from orgs that don’t have source tracking. To remove deleted items from orgs that have source tracking enabled, "sf project deploy start".

When you run this command, both the local source file and the metadata component in the org are deleted.

To delete multiple metadata components, either set multiple --metadata <name> flags or a single --metadata flag with multiple names separated by spaces. Enclose names that contain spaces in one set of double quotes. The same syntax applies to --source-dir.

#### Usage

```bash
sf project delete source [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `--api-version` | string | Override the api version used for api requests made by this command |
| `--loglevel` | string |  |
| `-o, --target-org` | string (required) | Username or alias of the target org. Not required if the `target-org` configuration variable is alre... |
| `-c, --check-only` | boolean | Validate delete command but don't delete anything from the org or the local project. |
| `-w, --wait` | string | Number of minutes to wait for the command to finish. |
| `--tests` | string | Apex tests to run when --test-level is RunSpecifiedTests. |
| `-l, --test-level` | string | Deployment Apex testing level. |
| `-r, --no-prompt` | boolean | Don't prompt for delete confirmation. |
| `-m, --metadata` | string | Metadata components to delete. |
| `-p, --source-dir` | string | Source file paths to delete. |
| `-t, --track-source` | boolean | If the delete succeeds, update the source tracking information. |
| `-f, --force-overwrite` | boolean | Ignore conflict warnings and overwrite changes to the org. |
| `--verbose` | boolean | Verbose output of the delete result. |

#### Examples

Delete all local Apex source files and all Apex classes from the org with alias "my-scratch":

```bash
sf project delete source --metadata ApexClass --target-org my-scratch
```

Delete a specific Apex class and a Profile that has a space in it from your default org; don't prompt for confirmation:

```bash
sf project delete source --metadata ApexClass:MyFabulousApexClass --metadata "Profile: My Profile" --no-prompt
```

Run the tests that aren’t in any managed packages as part of the deletion; if the delete succeeds, and the org has source-tracking enabled, update the source tracking information:

```bash
sf project delete source --metadata ApexClass --test-level RunLocalTests --track-source
```

Delete the Apex source files in a directory and the corresponding components from your default org:

```bash
sf project delete source --source-dir force-app/main/default/classes
```

#### Aliases

`force:source:delete`

> *Plugin: @salesforce/plugin-deploy-retrieve*


### project delete tracking

**Delete all local source tracking information.**

WARNING: This command deletes or overwrites all existing source tracking files. Use with extreme caution.

Deletes all local source tracking information. When you next run 'project deploy preview', Salesforce CLI displays all local and remote files as changed, and any files with the same name are listed as conflicts.

#### Usage

```bash
sf project delete tracking [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `--api-version` | string | Override the api version used for api requests made by this command |
| `--loglevel` | string |  |
| `-o, --target-org` | string (required) | Username or alias of the target org. Not required if the `target-org` configuration variable is alre... |
| `-p, --no-prompt` | boolean | Don't prompt for source tracking override confirmation. |

#### Examples

Delete local source tracking for the org with alias "my-scratch":

```bash
$ sf project delete tracking --target-org my-scratch
```

#### Aliases

`force:source:tracking:clear`

> *Plugin: @salesforce/plugin-deploy-retrieve*


### project deploy cancel

**Cancel a deploy operation.**

Use this command to cancel a deploy operation that hasn't yet completed in the org. Deploy operations include standard deploys, quick deploys, deploy validations, and deploy cancellations.

Run this command by either passing it a job ID or specifying the --use-most-recent flag to use the job ID of the most recent deploy operation.

#### Usage

```bash
sf project deploy cancel [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `-o, --target-org` | string | Username or alias of the target org. |
| `--async` | boolean | Run the command asynchronously. |
| `-i, --job-id` | string | Job ID of the deploy operation you want to cancel. |
| `-r, --use-most-recent` | boolean | Use the job ID of the most recent deploy operation. |
| `-w, --wait` | string | Number of minutes to wait for the command to complete and display results. |

#### Examples

Cancel a deploy operation using a job ID:

```bash
sf project deploy cancel --job-id 0Af0x000017yLUFCA2
```

Cancel the most recent deploy operation:

```bash
sf project deploy cancel --use-most-recent
```

#### Aliases

`deploy:metadata:cancel`

> *Plugin: @salesforce/plugin-deploy-retrieve*


### project deploy pipeline quick

**Quickly deploy a validated deployment to an org.**

The first time you run any "project deploy pipeline" command, be sure to authorize the org in which DevOps Center is installed. The easiest way to authorize an org is with the "org login web" command.

Before you run this command, create a validated deployment with the "project deploy pipeline validate" command, which returns a job ID. Validated deployments haven't been deployed to the org yet; you deploy them with this command. Either pass the job ID to this command or use the --use-most-recent flag to use the job ID of the most recently validated deployment. For the quick deploy to succeed, the associated validated deployment must also have succeeded.

Executing this quick deploy command takes less time than a standard deploy because it skips running Apex tests. These tests were previously run as part of the validation. Validating first and then running a quick deploy is useful if the deployment to your production org take several hours and you don’t want to risk a failed deploy.

This command doesn't support source-tracking. The source you deploy overwrites the corresponding metadata in your org. This command doesn’t attempt to merge your source with the versions in your org.

#### Usage

```bash
sf project deploy pipeline quick [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--async` | boolean | Run the command asynchronously. |
| `--concise` | boolean | Show concise output of the command result. |
| `--verbose` | boolean | Show verbose output of the command result. |
| `-w, --wait` | string | Number of minutes to wait for command to complete and display results. |
| `-c, --devops-center-username` | string (required) | Username or alias of the DevOps Center org. |
| `-i, --job-id` | string | Job ID of the validated deployment to quick deploy. |
| `-r, --use-most-recent` | boolean | Use the job ID of the most recently validated deployment. |

#### Examples

Run a quick deploy using your default Devops Center org and a job ID:

```bash
sf project deploy pipeline quick --job-id 0Af0x000017yLUFCA2
```

Asynchronously run a quick deploy of the most recently validated deployment using an org with alias "my-prod-org":

```bash
sf project deploy pipeline quick --async --use-most-recent --devops-center-username my-prod-org
```

> *Plugin: @salesforce/plugin-devops-center*


### project deploy pipeline report

**Check the status of a pipeline deploy operation.**

The first time you run any "project deploy pipeline" command, be sure to authorize the org in which DevOps Center is installed. The easiest way to authorize an org is with the "org login web" command.

Run this command by either indicating a job ID or specifying the —use-most-recent flag to use the job ID of the most recent deploy operation.

#### Usage

```bash
sf project deploy pipeline report [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `-c, --devops-center-username` | string (required) | Username or alias of the DevOps Center org. |
| `-i, --job-id` | string | Job ID of the pipeline deployment to check the status of. |
| `-r, --use-most-recent` | boolean | Use the job ID of the most recent deploy operation. |

#### Examples

Check the status using a job ID:

```bash
sf project deploy pipeline report --devops-center-username MyStagingSandbox --job-id 0Af0x000017yLUFCA2
```

Check the status of the most recent deploy operation:

```bash
sf project deploy pipeline report --devops-center-username MyStagingSandbox --use-most-recent
```

> *Plugin: @salesforce/plugin-devops-center*


### project deploy pipeline resume

**Resume watching a pipeline deploy operation.**

The first time you run any "project deploy pipeline" command, be sure to authorize the org in which DevOps Center is installed. The easiest way to authorize an org is with the "org login web" command. 

Use this command to resume watching a pipeline deploy operation if the original command times out or you specified the --async flag.

Run this command by either indicating a job ID or specifying the --use-most-recent flag to use the job ID of the most recent deploy operation.

#### Usage

```bash
sf project deploy pipeline resume [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `-c, --devops-center-username` | string (required) | Username or alias of the DevOps Center org. |
| `-i, --job-id` | string | Job ID of the pipeline deploy operation you want to resume. |
| `-r, --use-most-recent` | boolean | Use the job ID of the most recent deploy operation. |
| `--concise` | boolean | Show concise output of the command result. |
| `--verbose` | boolean | Show verbose output of the command result. |
| `-w, --wait` | string | Number of minutes to wait for command to complete and display results. |

#### Examples

Resume watching a deploy operation using a job ID:

```bash
sf project deploy pipeline resume --job-id 0Af0x000017yLUFCA2
```

Resume watching the most recent deploy operation:

```bash
sf project deploy pipeline resume --use-most-recent
```

> *Plugin: @salesforce/plugin-devops-center*


### project deploy pipeline start

**Deploy changes from a branch to the pipeline stage’s org.**

The first time you run any "project deploy pipeline" command, be sure to authorize the org in which DevOps Center is installed. The easiest way to authorize an org is with the "org login web" command.

Before you run this command, changes in the pipeline stage's branch must be merged in the source control repository.

#### Usage

```bash
sf project deploy pipeline start [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `-b, --branch-name` | string (required) | Name of the branch in the source control repository that corresponds to the pipeline stage that you ... |
| `-v, --bundle-version-name` | string | Version name of the bundle. |
| `-a, --deploy-all` | boolean | Deploy all metadata in the branch to the stage's org. |
| `-p, --devops-center-project-name` | string (required) | Name of the DevOps Center project. |
| `-c, --devops-center-username` | string (required) | Username or alias of the DevOps Center org. |
| `-t, --tests` | string | Apex tests to run when --test-level is RunSpecifiedTests. |
| `-l, --test-level` | string | Deployment Apex testing level. |
| `--async` | boolean | Run the command asynchronously. |
| `-w, --wait` | string | Number of minutes to wait for command to complete and display results. |
| `--verbose` | boolean | Show verbose output of the command result. |
| `--concise` | boolean | Show concise output of the command result. |

#### Examples

Deploy changes in the Staging branch to the Staging environment (sandbox), if the previous stage is the bundling stage:

```bash
sf project deploy pipeline start --devops-center-project-name “Recruiting App” --branch-name staging --devops-center-username MyStagingSandbox --bundle-version-name 1.0
```

Deploy all changes in the main branch to the release environment:

```bash
sf project deploy pipeline start --devops-center-project-name “Recruiting App” --branch-name main --devops-center-username MyReleaseOrg --deploy-all
```

> *Plugin: @salesforce/plugin-devops-center*


### project deploy pipeline validate

**Perform a validate-only deployment from a branch to the pipeline stage’s org.**

The first time you run any "project deploy pipeline" command, be sure to authorize the org in which DevOps Center is installed. The easiest way to authorize an org is with the "org login web" command.

A validation runs Apex tests to verify whether a deployment will succeed without actually deploying the metadata to your environment, so you can then quickly deploy the changes later without re-running the tests.

#### Usage

```bash
sf project deploy pipeline validate [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `-b, --branch-name` | string (required) | Name of the branch in the source control repository that corresponds to the pipeline stage that you ... |
| `-v, --bundle-version-name` | string | Version name of the bundle. |
| `-a, --deploy-all` | boolean | Deploy all metadata in the branch to the stage's org. |
| `-p, --devops-center-project-name` | string (required) | Name of the DevOps Center project. |
| `-c, --devops-center-username` | string (required) | Username or alias of the DevOps Center org. |
| `-t, --tests` | string | Apex tests to run when --test-level is RunSpecifiedTests. |
| `-l, --test-level` | string | Deployment Apex testing level. |
| `--async` | boolean | Run the command asynchronously. |
| `-w, --wait` | string | Number of minutes to wait for command to complete and display results. |
| `--verbose` | boolean | Show verbose output of the command result. |
| `--concise` | boolean | Show concise output of the command result. |

#### Examples

Perform a validate-only deployment from the Staging branch to the Staging environment (sandbox):

```bash
sf project deploy pipeline validate --devops-center-project-name “Recruiting App” --branch-name staging --devops-center-username MyStagingSandbox
```

Perform a validate-only deployment of all changes from the main branch to the release environment:

```bash
sf project deploy pipeline validate --devops-center-project-name “Recruiting App” --branch-name main --devops-center-username MyReleaseOrg --deploy-all
```

> *Plugin: @salesforce/plugin-devops-center*


### project deploy preview

**Preview a deployment to see what will deploy to the org, the potential conflicts, and the ignored files.**

You must run this command from within a project.

The command outputs a table that describes what will happen if you run the "sf project deploy start" command. The table lists the metadata components that will be deployed and deleted. The table also lists the current conflicts between files in your local project and components in the org. Finally, the table lists the files that won't be deployed because they're included in your .forceignore file.

If your org allows source tracking, then this command displays potential conflicts between the org and your local project. Some orgs, such as production org, never allow source tracking. Source tracking is enabled by default on scratch and sandbox orgs; you can disable source tracking when you create the orgs by specifying the --no-track-source flag on the "sf org create scratch|sandbox" commands.

To preview the deployment of multiple metadata components, either set multiple --metadata <name> flags or a single --metadata flag with multiple names separated by spaces. Enclose names that contain spaces in one set of double quotes. The same syntax applies to --source-dir.

#### Usage

```bash
sf project deploy preview [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `-c, --ignore-conflicts` | boolean | Don't display conflicts in preview of the deployment. |
| `-x, --manifest` | string | Full file path for manifest (package.xml) of components to preview. |
| `-m, --metadata` | string | Metadata component names to preview. |
| `-d, --source-dir` | string | Path to the local source files to preview. |
| `-o, --target-org` | string (required) | Username or alias of the target org. Not required if the `target-org` configuration variable is alre... |
| `--concise` | boolean | Show only the changes that will be deployed; omits files that are forceignored. |

#### Examples

```bash
NOTE: The commands to preview a deployment and actually deploy it use similar flags. We provide a few preview examples here, but see the help for "sf project deploy start" for more examples that you can adapt for previewing.
```

Preview the deployment of source files in a directory, such as force-app, to your default org:

```bash
sf project deploy preview  --source-dir force-app
```

Preview the deployment of all Apex classes to an org with alias "my-scratch":

```bash
sf project deploy preview --metadata ApexClass --target-org my-scratch
```

Preview deployment of a specific Apex class:

```bash
sf project deploy preview --metadata ApexClass:MyApexClass
```

Preview deployment of all components listed in a manifest:

```bash
sf project deploy preview --manifest path/to/package.xml
```

#### Aliases

`deploy:metadata:preview`

> *Plugin: @salesforce/plugin-deploy-retrieve*


### project deploy quick

**Quickly deploy a validated deployment to an org.**

Before you run this command, first create a validated deployment with the "sf project deploy validate" command, which returns a job ID. Validated deployments haven't been deployed to the org yet; you deploy them with this command. Either pass the job ID to this command or use the --use-most-recent flag to use the job ID of the most recently validated deployment. For the quick deploy to succeed, the associated validated deployment must also have succeeded.

Executing this quick deploy command takes less time than a standard deploy because it skips running Apex tests. These tests were previously run as part of the validation. Validating first and then running a quick deploy is useful if the deployment to your production org take several hours and you don’t want to risk a failed deploy.

This command doesn't support source-tracking. The source you deploy overwrites the corresponding metadata in your org. This command doesn’t attempt to merge your source with the versions in your org.

Note: Don't use this command on sandboxes; the command is intended to be used on production orgs. By default, sandboxes don't run tests during a deploy. Use "sf project deploy start" instead.

#### Usage

```bash
sf project deploy quick [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `--async` | boolean | Run the command asynchronously. |
| `--concise` | boolean | Show concise output of the deploy result. |
| `-i, --job-id` | string | Job ID of the deployment you want to quick deploy. |
| `-o, --target-org` | string | Username or alias of the target org. |
| `-r, --use-most-recent` | boolean | Use the job ID of the most recently validated deployment. |
| `--verbose` | boolean | Show verbose output of the deploy result. |
| `-w, --wait` | string | Number of minutes to wait for the command to complete and display results. |
| `-a, --api-version` | string | Target API version for the deploy. |

#### Examples

Run a quick deploy to your default org using a job ID:

```bash
sf project deploy quick --job-id 0Af0x000017yLUFCA2
```

Asynchronously run a quick deploy of the most recently validated deployment to an org with alias "my-prod-org":

```bash
sf project deploy quick --async --use-most-recent --target-org my-prod-org
```

#### Aliases

`deploy:metadata:quick`

> *Plugin: @salesforce/plugin-deploy-retrieve*


### project deploy report

**Check or poll for the status of a deploy operation.**

Deploy operations include standard deploys, quick deploys, deploy validations, and deploy cancellations.

Run this command by either passing it a job ID or specifying the --use-most-recent flag to use the job ID of the most recent deploy operation. If you specify the --wait flag, the command polls for the status every second until the timeout of --wait minutes. If you don't specify the --wait flag, the command simply checks and displays the status of the deploy; the command doesn't poll for the status.

You typically don't specify the --target-org flag because the cached job already references the org to which you deployed. But if you run this command on a computer different than the one from which you deployed, then you must specify the --target-org and it must point to the same org.

This command doesn't update source tracking information.

#### Usage

```bash
sf project deploy report [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `-o, --target-org` | string | Username or alias of the target org. |
| `-i, --job-id` | string | Job ID of the deploy operation you want to check the status of. |
| `-r, --use-most-recent` | boolean | Use the job ID of the most recent deploy operation. |
| `--coverage-formatters` | string | Format of the code coverage results. |
| `--junit` | boolean | Output JUnit test results. |
| `--results-dir` | string | Output directory for code coverage and JUnit results; defaults to the deploy ID. |
| `-w, --wait` | string | Number of minutes to wait for command to complete and display results. |

#### Examples

Check the status using a job ID:

```bash
sf project deploy report --job-id 0Af0x000017yLUFCA2
```

Check the status of the most recent deploy operation:

```bash
sf project deploy report --use-most-recent
```

Poll for the status using a job ID and target org:

```bash
sf project deploy report --job-id 0Af0x000017yLUFCA2 --target-org me@my.org --wait 30
```

#### Aliases

`deploy:metadata:report`

> *Plugin: @salesforce/plugin-deploy-retrieve*


### project deploy resume

**Resume watching a deploy operation and update source tracking when the deploy completes.**

Use this command to resume watching a deploy operation if the original command times out or you specified the --async flag. Deploy operations include standard deploys, quick deploys, deploy validations, and deploy cancellations. This command doesn't resume the original operation itself, because the operation always continues after you've started it, regardless of whether you're watching it or not. When the deploy completes, source tracking information is updated as needed.

Run this command by either passing it a job ID or specifying the --use-most-recent flag to use the job ID of the most recent deploy operation.

#### Usage

```bash
sf project deploy resume [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `--concise` | boolean | Show concise output of the deploy operation result. |
| `-i, --job-id` | string | Job ID of the deploy operation you want to resume. |
| `-r, --use-most-recent` | boolean | Use the job ID of the most recent deploy operation. |
| `--verbose` | boolean | Show verbose output of the deploy operation result. |
| `-w, --wait` | string | Number of minutes to wait for the command to complete and display results. |
| `--coverage-formatters` | string | Format of the code coverage results. |
| `--junit` | boolean | Output JUnit test results. |
| `--results-dir` | string | Output directory for code coverage and JUnit results; defaults to the deploy ID. |

#### Examples

Resume watching a deploy operation using a job ID:

```bash
sf project deploy resume --job-id 0Af0x000017yLUFCA2
```

Resume watching the most recent deploy operation:

```bash
sf project deploy resume --use-most-recent
```

#### Aliases

`deploy:metadata:resume`

> *Plugin: @salesforce/plugin-deploy-retrieve*


### project deploy start

**Deploy metadata to an org from your local project.**

You must run this command from within a project.

Metadata components are deployed in source format by default. Deploy them in metadata format by specifying the --metadata-dir flag, which specifies the root directory or ZIP file that contains the metadata formatted files you want to deploy.

If your org allows source tracking, then this command tracks the changes in your source. Some orgs, such as production orgs, never allow source tracking. Source tracking is enabled by default on scratch and sandbox orgs; you can disable source tracking when you create the orgs by specifying the --no-track-source flag on the "sf org create scratch|sandbox" commands.

To deploy multiple metadata components, either set multiple --metadata <name> flags or a single --metadata flag with multiple names separated by spaces. Enclose names that contain spaces in one set of double quotes. The same syntax applies to --source-dir.

#### Usage

```bash
sf project deploy start [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `-a, --api-version` | string | Target API version for the deploy. |
| `--async` | boolean | Run the command asynchronously. |
| `--concise` | boolean | Show concise output of the deploy result. |
| `--dry-run` | boolean | Validate deploy and run Apex tests but don’t save to the org. |
| `-c, --ignore-conflicts` | boolean | Ignore conflicts and deploy local files, even if they overwrite changes in the org. |
| `-r, --ignore-errors` | boolean | Ignore any errors and don’t roll back deployment. |
| `-g, --ignore-warnings` | boolean | Ignore warnings and allow a deployment to complete successfully. |
| `-x, --manifest` | string | Full file path for manifest (package.xml) of components to deploy. |
| `-m, --metadata` | string | Metadata component names to deploy. Wildcards (`*` ) supported as long as you use quotes, such as `A... |
| `--metadata-dir` | string | Root of directory or zip file of metadata formatted files to deploy. |
| `--single-package` | boolean | Indicates that the metadata zip file points to a directory structure for a single package. |
| `-d, --source-dir` | string | Path to the local source files to deploy. |
| `-o, --target-org` | string (required) | Username or alias of the target org. Not required if the `target-org` configuration variable is alre... |
| `-t, --tests` | string | Apex tests to run when --test-level is RunSpecifiedTests. |
| `-l, --test-level` | string | Deployment Apex testing level. |
| `--verbose` | boolean | Show verbose output of the deploy result. |
| `-w, --wait` | string | Number of minutes to wait for command to complete and display results. |
| `--purge-on-delete` | boolean | Specify that deleted components in the destructive changes manifest file are immediately eligible fo... |
| `--pre-destructive-changes` | string | File path for a manifest (destructiveChangesPre.xml) of components to delete before the deploy. |
| `--post-destructive-changes` | string | File path for a manifest (destructiveChangesPost.xml) of components to delete after the deploy. |
| `--coverage-formatters` | string | Format of the code coverage results. |
| `--junit` | boolean | Output JUnit test results. |
| `--results-dir` | string | Output directory for code coverage and JUnit results; defaults to the deploy ID. |

#### Examples

Deploy local changes not in the org; uses your default org:

```bash
sf project deploy start
```

Deploy all source files in the "force-app" directory to an org with alias "my-scratch"; show only concise output, in other words don't print a list of all the source that was deployed:

```bash
sf project deploy start  --source-dir force-app --target-org my-scratch --concise
```

Deploy all the Apex classes and custom objects that are in the "force-app" directory. The list views, layouts, etc, that are associated with the custom objects are also deployed. Both examples are equivalent:

```bash
sf project deploy start --source-dir force-app/main/default/classes force-app/main/default/objects
sf project deploy start --source-dir force-app/main/default/classes --source-dir force-app/main/default/objects
```

Deploy all Apex classes that are in all package directories defined in the "sfdx-project.json" file:

```bash
sf project deploy start --metadata ApexClass
```

Deploy a specific Apex class; ignore any conflicts between the local project and org (be careful with this flag, because it will overwrite the Apex class in the org if there are conflicts!):

```bash
sf project deploy start --metadata ApexClass:MyApexClass --ignore-conflicts
```

Deploy specific Apex classes that match a pattern; in this example, deploy Apex classes whose names contain the string "MyApex". Also ignore any deployment warnings (again, be careful with this flag! You typically want to see the warnings):

```bash
sf project deploy start --metadata 'ApexClass:MyApex*' --ignore-warnings
```

Deploy a custom object called ExcitingObject that's in the SBQQ namespace:

```bash
sf project deploy start --metadata CustomObject:SBQQ__ExcitingObject
```

Deploy all custom objects in the SBQQ namespace by using a wildcard and quotes:

```bash
sf project deploy start --metadata 'CustomObject:SBQQ__*'
```

Deploy all custom objects and Apex classes found in all defined package directories (both examples are equivalent):

```bash
sf project deploy start --metadata CustomObject ApexClass
sf project deploy start --metadata CustomObject --metadata ApexClass
```

Deploy all Apex classes and a profile that has a space in its name:

```bash
sf project deploy start --metadata ApexClass --metadata "Profile:My Profile"
```

Deploy all components listed in a manifest:

```bash
sf project deploy start --manifest path/to/package.xml
```

Run the tests that aren’t in any managed packages as part of a deployment:

```bash
sf project deploy start --metadata ApexClass --test-level RunLocalTests
```

Deploy all metadata formatted files in the "MDAPI" directory:

```bash
sf project deploy start --metadata-dir MDAPI
```

Deploy all metadata formatted files in the "MDAPI" directory; items listed in the MDAPI/destructiveChangesPre.xml and MDAPI/destructiveChangesPost.xml manifests are immediately eligible for deletion rather than stored in the Recycle Bin:

```bash
sf project deploy start --metadata-dir MDAPI --purge-on-delete
```

#### Aliases

`deploy:metadata`

> *Plugin: @salesforce/plugin-deploy-retrieve*


### project deploy validate

**Validate a metadata deployment without actually executing it.**

Use this command to verify whether a deployment will succeed without actually deploying the metadata to your org. This command is similar to "sf project deploy start", except you're required to run Apex tests, and the command returns a job ID rather than executing the deployment. If the validation succeeds, then you pass this job ID to the "sf project deploy quick" command to actually deploy the metadata. This quick deploy takes less time because it skips running Apex tests. The job ID is valid for 10 days from when you started the validation. Validating first is useful if the deployment to your production org take several hours and you don’t want to risk a failed deploy.

You must run this command from within a project.

This command doesn't support source-tracking. When you quick deploy with the resulting job ID, the source you deploy overwrites the corresponding metadata in your org.

To validate the deployment of multiple metadata components, either set multiple --metadata <name> flags or a single --metadata flag with multiple names separated by spaces. Enclose names that contain spaces in one set of double quotes. The same syntax applies to --source-dir.

Note: Don't use this command on sandboxes; the command is intended to be used on production orgs. By default, sandboxes don't run tests during a deploy. If you want to validate a deployment with tests on a sandbox, use "sf project deploy start --dry-run --test-level RunLocalTests" instead.

#### Usage

```bash
sf project deploy validate [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `-a, --api-version` | string | Target API version for the validation. |
| `--async` | boolean | Run the command asynchronously. |
| `--concise` | boolean | Show concise output of the validation result. |
| `-x, --manifest` | string | Full file path for manifest (package.xml) of components to validate for deployment. |
| `-m, --metadata` | string | Metadata component names to validate for deployment. |
| `-d, --source-dir` | string | Path to the local source files to validate for deployment. |
| `--metadata-dir` | string | Root of directory or zip file of metadata formatted files to deploy. |
| `--single-package` | boolean | Indicates that the metadata zip file points to a directory structure for a single package. |
| `-o, --target-org` | string (required) | Username or alias of the target org. Not required if the `target-org` configuration variable is alre... |
| `-t, --tests` | string | Apex tests to run when --test-level is RunSpecifiedTests. |
| `-l, --test-level` | string | Deployment Apex testing level. |
| `--verbose` | boolean | Show verbose output of the validation result. |
| `-w, --wait` | string | Number of minutes to wait for the command to complete and display results. |
| `-g, --ignore-warnings` | boolean | Ignore warnings and allow a deployment to complete successfully. |
| `--coverage-formatters` | string | Format of the code coverage results. |
| `--junit` | boolean | Output JUnit test results. |
| `--results-dir` | string | Output directory for code coverage and JUnit results; defaults to the deploy ID. |
| `--purge-on-delete` | boolean | Specify that deleted components in the destructive changes manifest file are immediately eligible fo... |
| `--pre-destructive-changes` | string | File path for a manifest (destructiveChangesPre.xml) of components to delete before the deploy |
| `--post-destructive-changes` | string | File path for a manifest (destructiveChangesPost.xml) of components to delete after the deploy. |

#### Examples

```bash
NOTE: These examples focus on validating large deployments. See the help for "sf project deploy start" for examples of deploying smaller sets of metadata which you can also use to validate.
```

Validate the deployment of all source files in the "force-app" directory to the default org:

```bash
sf project deploy validate --source-dir force-app
```

Validate the deployment of all source files in two directories: "force-app" and "force-app-utils":

```bash
sf project deploy validate --source-dir force-app --source-dir force-app-utils
```

Asynchronously validate the deployment and run all tests in the org with alias "my-prod-org"; command immediately returns the job ID:

```bash
sf project deploy validate --source-dir force-app --async --test-level RunAllTestsInOrg --target-org my-prod-org
```

Validate the deployment of all components listed in a manifest:

```bash
sf project deploy validate --manifest path/to/package.xml
```

#### Aliases

`deploy:metadata:validate`

> *Plugin: @salesforce/plugin-deploy-retrieve*


### project generate

**Generate a Salesforce DX project.**

A Salesforce DX project has a specific structure and a configuration file (sfdx-project.json) that identifies the directory as a Salesforce DX project. This command generates the necessary configuration files and directories to get you started.

By default, the generated sfdx-project.json file sets the sourceApiVersion property to the default API version currently used by Salesforce CLI. To specify a different version, set the apiVersion configuration variable. For example: "sf config set apiVersion=57.0 --global".

#### Usage

```bash
sf project generate [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `-n, --name` | string (required) | Name of the generated project. |
| `-t, --template` | string | Template to use for project creation. |
| `-d, --output-dir` | string | Directory for saving the created files. |
| `-s, --namespace` | string | Namespace associated with this project and any connected scratch orgs. |
| `-p, --default-package-dir` | string | Default package directory name. |
| `-x, --manifest` | boolean | Generate a manifest (package.xml) for change-set based development. |
| `-l, --login-url` | string | Salesforce instance login URL. |
| `--loglevel` | string |  |
| `--api-version` | string | Will set this version as sourceApiVersion in the sfdx-project.json file |

#### Examples

Generate a project called "mywork":

```bash
sf project generate --name mywork
```

Similar to previous example, but generate the files in a directory called "myapp":

```bash
sf project generate --name mywork --default-package-dir myapp
```

Similar to prevoius example, but also generate a default package.xml manifest file:

```bash
sf project generate --name mywork --default-package-dir myapp --manifest
```

Generate a project with the minimum files and directories:

```bash
sf project generate --name mywork --template empty
```

#### Aliases

`force:project:create`

> *Plugin: @salesforce/plugin-templates*


### project generate manifest

**Create a project manifest that lists the metadata components you want to deploy or retrieve.**

Create a manifest from a list of metadata components (--metadata) or from one or more local directories that contain source files (--source-dir). You can specify either of these flags, not both.

Use --type to specify the type of manifest you want to create. The resulting manifest files have specific names, such as the standard package.xml or destructiveChanges.xml to delete metadata. Valid values for this flag, and their respective file names, are:

    * package : package.xml (default)
    * pre : destructiveChangesPre.xml
    * post : destructiveChangesPost.xml
    * destroy : destructiveChanges.xml

See https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/meta_deploy_deleting_files.htm for information about these destructive manifest files.

Use --name to specify a custom name for the generated manifest if the pre-defined ones don’t suit your needs. You can specify either --type or --name, but not both.

To include multiple metadata components, either set multiple --metadata <name> flags or a single --metadata flag with multiple names separated by spaces. Enclose names that contain spaces in one set of double quotes. The same syntax applies to --include-packages and --source-dir.

To build a manifest from the metadata in an org, use the --from-org flag. You can combine --from-org with the --metadata flag to include only certain metadata types, or with the --excluded-metadata flag to exclude certain metadata types. When building a manifest from an org, the command makes many concurrent API calls to discover the metadata that exists in the org. To limit the number of concurrent requests, use the SF_LIST_METADATA_BATCH_SIZE environment variable and set it to a size that works best for your org and environment. If you experience timeouts or inconsistent manifest contents, then setting this environment variable can improve accuracy. However, the command takes longer to run because it sends fewer requests at a time.

#### Usage

```bash
sf project generate manifest [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `--api-version` | string | Override the api version used for api requests made by this command |
| `--loglevel` | string |  |
| `-m, --metadata` | string | Names of metadata components to include in the manifest. |
| `-p, --source-dir` | string | Paths to the local source files to include in the manifest. |
| `-n, --name` | string | Name of a custom manifest file to create. |
| `-t, --type` | string | Type of manifest to create; the type determines the name of the created file. |
| `-c, --include-packages` | string | Package types (managed, unlocked) whose metadata is included in the manifest; by default, metadata i... |
| `--excluded-metadata` | string | Metadata types to exclude when building a manifest from an org. Specify the name of the type, not th... |
| `--from-org` | string | Username or alias of the org that contains the metadata components from which to build a manifest. |
| `-d, --output-dir` | string | Directory to save the created manifest. |

#### Examples

Create a manifest for deploying or retrieving all Apex classes and custom objects:

```bash
$ sf project generate manifest --metadata ApexClass --metadata CustomObject
```

Create a manifest for deleting the specified Apex class:

```bash
$ sf project generate manifest --metadata ApexClass:MyApexClass --type destroy
```

Create a manifest for deploying or retrieving all the metadata components in the specified local directory; name the file myNewManifest.xml:

```bash
$ sf project generate manifest --source-dir force-app --name myNewManifest
```

Create a manifest from the metadata components in the specified org and include metadata in any unlocked packages:

```bash
$ sf project generate manifest --from-org test@myorg.com --include-packages unlocked
```

Create a manifest from specific metadata types in an org:

```bash
$ sf project generate manifest --from-org test@myorg.com --metadata ApexClass,CustomObject,CustomLabels
```

Create a manifest from all metadata components in an org excluding specific metadata types:

```bash
$ sf project generate manifest --from-org test@myorg.com --excluded-metadata StandardValueSet
```

#### Aliases

`force:source:manifest:create`

> *Plugin: @salesforce/plugin-deploy-retrieve*


### project list ignored

**Check your local project package directories for forceignored files.**

When deploying or retrieving metadata between your local project and an org, you can specify the source files you want to exclude with a .forceignore file. The .forceignore file structure mimics the .gitignore structure. Each line in .forceignore specifies a pattern that corresponds to one or more files. The files typically represent metadata components, but can be any files you want to exclude, such as LWC configuration JSON files or tests.

#### Usage

```bash
sf project list ignored [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `-p, --source-dir` | string | File or directory of files that the command checks for foreceignored files. |

#### Examples

List all the files in all package directories that are ignored:

```bash
sf project list ignored
```

List all the files in a specific directory that are ignored:

```bash
sf project list ignored --source-dir force-app
```

Check if a particular file is ignored:

```bash
sf project list ignored --source-dir package.xml
```

#### Aliases

`force:source:ignored:list`

> *Plugin: @salesforce/plugin-deploy-retrieve*


### project reset tracking

**Reset local and remote source tracking.**

WARNING: This command deletes or overwrites all existing source tracking files. Use with extreme caution.

Resets local and remote source tracking so that Salesforce CLI no longer registers differences between your local files and those in the org. When you next run 'project deploy preview', Salesforce CLI returns no results, even though conflicts might actually exist. Salesforce CLI then resumes tracking new source changes as usual.

Use the --revision flag to reset source tracking to a specific revision number of an org source member. To get the revision number, query the SourceMember Tooling API object with the 'data soql' command. For example:

    sf data query --query "SELECT MemberName, MemberType, RevisionCounter FROM SourceMember" --use-tooling-api --target-org my-scratch

#### Usage

```bash
sf project reset tracking [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `-o, --target-org` | string (required) | Username or alias of the target org. Not required if the `target-org` configuration variable is alre... |
| `--api-version` | string | Override the api version used for api requests made by this command |
| `--loglevel` | string |  |
| `-r, --revision` | string | SourceMember revision counter number to reset to. |
| `-p, --no-prompt` | boolean | Don't prompt for source tracking override confirmation. |

#### Examples

Reset source tracking for the org with alias "my-scratch":

```bash
$ sf project reset tracking --target-org my-scratch
```

Reset source tracking to revision number 30 for your default org:

```bash
$ sf project reset tracking --revision 30
```

#### Aliases

`force:source:tracking:reset`

> *Plugin: @salesforce/plugin-deploy-retrieve*


### project retrieve preview

**Preview a retrieval to see what will be retrieved from the org, the potential conflicts, and the ignored files.**

You must run this command from within a project.

The command outputs a table that describes what will happen if you run the "sf project retrieve start" command. The table lists the metadata components that will be retrieved and deleted. The table also lists the current conflicts between files in your local project and components in the org. Finally, the table lists the files that won't be retrieved because they're included in your .forceignore file.

If your org allows source tracking, then this command displays potential conflicts between the org and your local project. Some orgs, such as production org, never allow source tracking. Source tracking is enabled by default on scratch and sandbox orgs; you can disable source tracking when you create the orgs by specifying the --no-track-source flag on the "sf org create scratch|sandbox" commands.

#### Usage

```bash
sf project retrieve preview [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `-c, --ignore-conflicts` | boolean | Don't display conflicts in the preview of the retrieval. |
| `-o, --target-org` | string (required) | Username or alias of the target org. Not required if the `target-org` configuration variable is alre... |
| `--concise` | boolean | Show only the changes that will be retrieved; omits files that are forceignored. |

#### Examples

Preview the retrieve of all changes from your default org:

```bash
sf project retrieve preview
```

Preview the retrieve when ignoring any conflicts from an org with alias "my-scratch":

```bash
sf project retrieve preview --ignore-conflicts --target-org my-scratch
```

#### Aliases

`retrieve:metadata:preview`

> *Plugin: @salesforce/plugin-deploy-retrieve*


### project retrieve start

**Retrieve metadata from an org to your local project.**

You must run this command from within a project.

Metadata components are retrieved in source format by default. Retrieve them in metadata format by specifying the --target-metadata-dir flag, which retrieves the components into a ZIP file in the specified directory.

If your org allows source tracking, then this command tracks the changes in your source. Some orgs, such as production orgs, never allow source tracking. Source tracking is enabled by default on scratch and sandbox orgs; you can disable source tracking when you create the orgs by specifying the --no-track-source flag on the "sf org create scratch|sandbox" commands.

To retrieve multiple metadata components, either use multiple --metadata <name> flags or use a single --metadata flag with multiple names separated by spaces. Enclose names that contain spaces in one set of double quotes. The same syntax applies to --source-dir.

#### Usage

```bash
sf project retrieve start [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `-a, --api-version` | string | Target API version for the retrieve. |
| `-c, --ignore-conflicts` | boolean | Ignore conflicts and retrieve and save files to your local filesystem, even if they overwrite your l... |
| `-x, --manifest` | string | File path for the manifest (package.xml) that specifies the components to retrieve. |
| `-m, --metadata` | string | Metadata component names to retrieve. Wildcards (`*`) supported as long as you use quotes, such as `... |
| `-n, --package-name` | string | Package names to retrieve. Use of this flag is for reference only; don't use it to retrieve packaged... |
| `-r, --output-dir` | string | Directory root for the retrieved source files. |
| `--single-package` | boolean | Indicates that the zip file points to a directory structure for a single package. |
| `-d, --source-dir` | string | File paths for source to retrieve from the org. |
| `-t, --target-metadata-dir` | string | Directory that will contain the retrieved metadata format files or ZIP. |
| `-o, --target-org` | string (required) | Username or alias of the target org. Not required if the `target-org` configuration variable is alre... |
| `-w, --wait` | string | Number of minutes to wait for the command to complete and display results to the terminal window. |
| `-z, --unzip` | boolean | Extract all files from the retrieved zip file. |
| `--zip-file-name` | string | File name to use for the retrieved zip file. |

#### Examples

Retrieve all remote changes from your default org:

```bash
sf project retrieve start
```

Retrieve the source files in the "force-app" directory from an org with alias "my-scratch":

```bash
sf project retrieve start --source-dir force-app --target-org my-scratch
```

Retrieve all the Apex classes and custom objects whose source is in the "force-app" directory. The list views, layouts, etc, that are associated with the custom objects are also retrieved. Both examples are equivalent:

```bash
sf project retrieve start --source-dir force-app/main/default/classes force-app/main/default/objects
sf project retrieve start --source-dir force-app/main/default/classes --source-dir force-app/main/default/objects
```

Retrieve all Apex classes that are in all package directories defined in the "sfdx-project.json" file:

```bash
sf project retrieve start --metadata ApexClass
```

Retrieve a specific Apex class; ignore any conflicts between the local project and org (be careful with this flag, because it will overwrite the Apex class source files in your local project if there are conflicts!):

```bash
sf project retrieve start --metadata ApexClass:MyApexClass --ignore-conflicts
```

Retrieve specific Apex classes that match a pattern; in this example, retrieve Apex classes whose names contain the string "MyApex":

```bash
sf project retrieve start --metadata 'ApexClass:MyApex*'
```

Retrieve a custom object called ExcitingObject that's in the SBQQ namespace:

```bash
sf project retrieve start --metadata CustomObject:SBQQ__ExcitingObject
```

Retrieve all custom objects in the SBQQ namespace by using a wildcard and quotes:

```bash
sf project retrieve start --metadata 'CustomObject:SBQQ__*'
```

Retrieve all list views for the Case standard object:

```bash
sf project retrieve start --metadata 'ListView:Case*'
```

Retrieve all custom objects and Apex classes found in all defined package directories (both examples are equivalent):

```bash
sf project retrieve start --metadata CustomObject ApexClass
sf project retrieve start --metadata CustomObject --metadata ApexClass
```

Retrieve all metadata components listed in a manifest:

```bash
sf project retrieve start --manifest path/to/package.xml
```

Retrieve metadata from a package:

```bash
sf project retrieve start --package-name MyPackageName
```

Retrieve metadata from multiple packages, one of which has a space in its name (both examples are equivalent):

```bash
sf project retrieve start --package-name Package1 "PackageName With Spaces" Package3
sf project retrieve start --package-name Package1 --package-name "PackageName With Spaces" --package-name Package3
```

Retrieve the metadata components listed in the force-app directory, but retrieve them in metadata format into a ZIP file in the "output" directory:

```bash
sf project retrieve start --source-dir force-app --target-metadata-dir output
```

Retrieve in metadata format and automatically extract the contents into the "output" directory:

```bash
sf project retrieve start --source-dir force-app --target-metadata-dir output --unzip
```

#### Aliases

`retrieve:metadata`

> *Plugin: @salesforce/plugin-deploy-retrieve*


---

## schema

*4 commands in this topic*

### schema generate field

**Generate metadata source files for a new custom field on a specified object.**

This command is interactive and must be run in a Salesforce DX project directory. You're required to specify the field's label with the "--label" flag. The command uses this label to provide intelligent suggestions for other field properties, such as its API name.

You can generate a custom field on either a standard object, such as Account, or a custom object. In both cases, the source files for the object must already exist in your local project before you run this command. If you create a relationship field, the source files for the parent object must also exist in your local directory.  Use the command "sf metadata retrieve -m CustomObject:<object>" to retrieve source files for both standard and custom objects from your org.  To create a custom object, run the "sf generate metadata sobject" command or use the Object Manager UI in your Salesforce org.

#### Usage

```bash
sf schema generate field [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--flags-dir` | string | Import flag values from a directory. |
| `-l, --label` | string (required) | The field's label. |
| `-o, --object` | string | The directory that contains the object's source files. |

#### Examples

Create a field with the specified label; the command prompts you for the object:

```bash
sf schema generate field --label "My Field"
```

Specify the local path to the object's folder:

```bash
sf schema generate field --label "My Field" --object force-app/main/default/objects/MyObject__c
```

#### Aliases

`generate:metadata:field`

> *Plugin: @salesforce/plugin-sobject*


### schema generate platformevent

**Generate metadata source files for a new platform event.**

This command is interactive and must be run in a Salesforce DX project directory. You're required to specify the event's label with the "--label" flag. The command uses this label to provide intelligent suggestions for other event properties, such as its API name.

#### Usage

```bash
sf schema generate platformevent [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--flags-dir` | string | Import flag values from a directory. |
| `-l, --label` | string (required) | The platform event's label. |

#### Examples

Create a platform event with the specified label:

```bash
sf schema generate platformevent --label "My Platform Event"
```

#### Aliases

`generate:metadata:platformevent`

> *Plugin: @salesforce/plugin-sobject*


### schema generate sobject

**Generate metadata source files for a new custom object.**

This command is interactive and must be run in a Salesforce DX project directory. You're required to specify the object's label with the "--label" flag. The command uses this label to provide intelligent suggestions for other object properties, such as its API name and plural label.

All Salesforce objects are required to have a Name field, so this command also prompts you for the label and type of the Name field. Run the "sf metadata generate field" command to create additional fields for the object.

To reduce the number of prompts, use the "--use-default-features" flag to automatically enable some features, such as reporting and search on the object.

#### Usage

```bash
sf schema generate sobject [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--flags-dir` | string | Import flag values from a directory. |
| `-l, --label` | string (required) | The custom object's label. |
| `-f, --use-default-features` | boolean | Enable all optional features without prompting. |

#### Examples

Create a custom object with the specified label and be prompted for additional information:

```bash
sf schema generate sobject --label "My Object"
```

Create a custom object and enable optional features without prompting:

```bash
sf schema generate sobject --label "My Object" --use-default-features
```

#### Aliases

`generate:metadata:sobject`

> *Plugin: @salesforce/plugin-sobject*


### schema generate tab

**Generate the metadata source files for a new custom tab on a custom object.**

Custom tabs let you display custom object data or other web content in Salesforce. Custom tabs appear in Salesforce as an item in the app’s navigation bar and in the App Launcher.

This command must be run in a Salesforce DX project directory. You must pass all required information to it with the required flags. The source files for the custom object for which you're generating a tab don't need to exist in your local project.

#### Usage

```bash
sf schema generate tab [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `-o, --object` | string (required) | API name of the custom object you're generating a tab for. |
| `-d, --directory` | string (required) | Path to a "tabs" directory that will contain the source files for your new tab. |
| `-i, --icon` | string (required) | Number from 1 to 100 that specifies the color scheme and icon for the custom tab. |

#### Examples

Create a tab on the `MyObject__c` custom object:

```bash
sf schema generate tab --object `MyObject__c` --icon 54 --directory force-app/main/default/tabs
```

#### Aliases

`generate:metadata:tab`

> *Plugin: @salesforce/plugin-sobject*


---

## search

*1 commands in this topic*

### search

**Search for a command.**

Once you select a command, hit enter and it will show the help for that command.

#### Usage

```bash
sf search [FLAGS]
```

> *Plugin: @oclif/plugin-search*


---

## sobject

*2 commands in this topic*

### sobject describe

**Display the metadata for a standard or custom object or a Tooling API object.**

The metadata is displayed in JSON format. See this topic for a description of each property: https://developer.salesforce.com/docs/atlas.en-us.api.meta/api/sforce_api_calls_describesobjects_describesobjectresult.htm.

This command displays metadata for Salesforce objects by default. Use the --use-tooling-api flag to view metadata for a Tooling API object.

#### Usage

```bash
sf sobject describe [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `-o, --target-org` | string (required) | Username or alias of the target org. Not required if the `target-org` configuration variable is alre... |
| `--api-version` | string | Override the api version used for api requests made by this command |
| `--loglevel` | string |  |
| `-s, --sobject` | string (required) | API name of the object to describe. |
| `-t, --use-tooling-api` | boolean | Use Tooling API to display metadata for Tooling API objects. |

#### Examples

Display the metadata of the "Account" standard object in your default org:

```bash
sf sobject describe --sobject Account
```

Display the metadata of the "MyObject__c" custom object in the org with alias "my-scratch-org":

```bash
sf sobject describe --sobject MyObject__c --target-org my-scratch-org
```

Display the metadata of the ApexCodeCoverage Tooling API object in your default org:

```bash
sf sobject describe --sobject ApexCodeCoverage --use-tooling-api
```

#### Aliases

`force:schema:sobject:describe`

> *Plugin: @salesforce/plugin-schema*


### sobject list

**List all Salesforce objects of a specified category.**

You can list the standard objects, custom objects, or all. The lists include only Salesforce objects, not Tooling API objects.

#### Usage

```bash
sf sobject list [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `-o, --target-org` | string (required) | Username or alias of the target org. Not required if the `target-org` configuration variable is alre... |
| `--api-version` | string | Override the api version used for api requests made by this command |
| `--loglevel` | string |  |
| `-s, --sobject` | string | Category of objects to list. |

#### Examples

List all objects in your default org:

```bash
sf sobject list --sobject all
```

List only custom objects in the org with alias "my-scratch-org":

```bash
sf sobject list --sobject custom --target-org my-scratch-org
```

#### Aliases

`force:schema:sobject:list`

> *Plugin: @salesforce/plugin-schema*


---

## static-resource

*1 commands in this topic*

### static-resource generate

**Generate a static resource.**

Generates the metadata resource file in the specified directory or the current working directory. Static resource files must be contained in a parent directory called "staticresources" in your package directory. Either run this command from an existing directory of this name, or use the --output-dir flag to create one or point to an existing one.

#### Usage

```bash
sf static-resource generate [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `-n, --name` | string (required) | Name of the generated static resource. |
| `--type` | string | Content type (mime type) of the generated static resource. |
| `-d, --output-dir` | string | Directory for saving the created files. |
| `--api-version` | string | Override the api version used for api requests made by this command |
| `--loglevel` | string |  |

#### Examples

Generate the metadata file for a static resource called MyResource in the current directory:

```bash
sf static-resource generate --name MyResource
```

Similar to previous example, but specifies a MIME type of application/json:

```bash
sf static-resource generate --name MyResource --type application/json
```

Generate the resource file in the "force-app/main/default/staticresources" directory:

```bash
sf static-resource generate --name MyResource --output-dir force-app/main/default/staticresources
```

#### Aliases

`force:staticresource:create`

> *Plugin: @salesforce/plugin-templates*


---

## update

*1 commands in this topic*

### update

update the sf CLI

#### Usage

```bash
sf update [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--autoupdate` | boolean |  |
| `-a, --available` | boolean | See available versions. |
| `--force` | boolean | Force a re-download of the requested version. |
| `-i, --interactive` | boolean | Interactively select version to install. This is ignored if a channel is provided. |
| `-b, --verbose` | boolean | Show more details about the available versions. |
| `-v, --version` | string | Install a specific version. |

#### Arguments

| Argument | Description |
|----------|-------------|
| `channel` |  |

#### Examples

```bash
{"command":"sf update stable","description":"Update to the stable channel:"}
```

```bash
{"command":"sf update --version 1.0.0","description":"Update to a specific version:"}
```

```bash
{"command":"sf update --interactive","description":"Interactively select version:"}
```

```bash
{"command":"sf update --available","description":"See available versions:"}
```

> *Plugin: @oclif/plugin-update*


---

## version

*1 commands in this topic*

### version

#### Usage

```bash
sf version [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--verbose` | boolean | Show additional information about the CLI. |

> *Plugin: @oclif/plugin-version*


---

## visualforce

*2 commands in this topic*

### visualforce generate component

**Generate a Visualforce Component.**

The command generates the .Component file and associated metadata file in the specified directory or the current working directory by default.

#### Usage

```bash
sf visualforce generate component [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `-n, --name` | string (required) | Name of the generated Visualforce Component. |
| `-t, --template` | string | Template to use for file creation. |
| `-d, --output-dir` | string | Directory for saving the created files. |
| `--api-version` | string | Override the api version used for api requests made by this command |
| `-l, --label` | string (required) | Visualforce Component label. |
| `--loglevel` | string |  |

#### Examples

Generate the metadata files for a Visualforce component in the current directory:

```bash
sf visualforce generate component --name mycomponent --label mylabel
```

Similar to previous example, but generate the files in the directory "force-app/main/default/components":

```bash
sf visualforce generate component --name mycomponent --label mylabel --output-dir components
```

#### Aliases

`force:visualforce:component:create`

> *Plugin: @salesforce/plugin-templates*


### visualforce generate page

**Generate a Visualforce Page.**

The command generates the .Page file and associated metadata file in the specified directory or the current working directory by default.

#### Usage

```bash
sf visualforce generate page [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `-n, --name` | string (required) | Name of the generated Visualforce Page. |
| `-t, --template` | string | Template to use for file creation. |
| `-d, --output-dir` | string | Directory for saving the created files. |
| `--api-version` | string | Override the api version used for api requests made by this command |
| `-l, --label` | string (required) | Visualforce Page label. |
| `--loglevel` | string |  |

#### Examples

Generate the metadata files for a Visualforce page in the current directory:

```bash
sf visualforce generate page --name mypage --label mylabel
```

Similar to previous example, but generate the files in the directory "force-app/main/default/pages":

```bash
sf visualforce generate page --name mypage --label mylabel --output-dir pages
```

#### Aliases

`force:visualforce:page:create`

> *Plugin: @salesforce/plugin-templates*


---

## whatsnew

*1 commands in this topic*

### whatsnew

**Display Salesforce CLI release notes on the command line.**

By default, this command displays release notes for the currently installed CLI version on your computer. Use the --version flag to view release notes for a different release.

#### Usage

```bash
sf whatsnew [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |
| `--flags-dir` | string | Import flag values from a directory. |
| `-v, --version` | string | CLI version or tag for which to display release notes. |
| `--hook` | boolean | This hidden parameter is used in post install or update hooks. |
| `--loglevel` | string |  |

#### Examples

Display release notes for the currently installed CLI version:

```bash
sf whatsnew
```

Display release notes for CLI version 7.120.0:

```bash
sf whatsnew --version 7.120.0
```

Display release notes for the CLI version that corresponds to a tag (stable, stable-rc, latest, latest-rc, rc):

```bash
sf whatsnew --version latest
```

#### Aliases

`whatsnew`

> *Plugin: @salesforce/plugin-info*


---

## which

*1 commands in this topic*

### which

Show which plugin a command is in.

#### Usage

```bash
sf which [FLAGS]
```

#### Flags

| Flag | Type | Description |
|------|------|-------------|
| `--json` | boolean | Format output as json. |

#### Examples

```bash
{"command":"sf which help","description":"See which plugin the `help` command is in:"}
```

```bash
{"command":"sf which foo:bar:baz","description":"Use colon separators."}
```

```bash
{"command":"sf which foo bar baz","description":"Use spaces as separators."}
```

```bash
{"command":"sf which \"foo bar baz\"","description":"Wrap command in quotes to use spaces as separators."}
```

> *Plugin: @oclif/plugin-which*


---
