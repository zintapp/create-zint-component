#!/usr/bin/env node

import { join } from "path";
import { readdir, mkdirp, copy, rename } from "fs-extra";
import * as inquirer from "inquirer";
import { Command } from "commander";
import { replaceInFile } from "replace-in-file";

interface RepoConfig {
  component: string;
  dataType?: string;
  encoding?: string;
  split?: boolean;
  json?: boolean;
}

const inquireConfig = async () => {
  let config: RepoConfig;
  let answers = await inquirer.prompt([
    {
      type: "input",
      name: "component",
      message: "Component name:",
    },
  ]);

  config = answers as RepoConfig;

  answers = await inquirer.prompt([
    {
      type: "list",
      name: "dataType",

      message: "Stream processing : what type of data is expected ?",
      choices: [
        { value: "text", name: "String data (ex: text, JSON, ...)" },
        { value: "binary", name: "Binary data in a Buffer (ex: image data)" },
      ],
    },
  ]);
  config = { ...config, ...answers };

  if (config.dataType === "text") {
    answers = await inquirer.prompt([
      {
        type: "input",
        name: "encoding",
        message: "Expected data encoding ?",
        default: "utf-8",
      },
      {
        type: "list",
        name: "split",
        message: "Split the data as a stream of lines?",
        choices: [
          {
            value: false,
            name: "Send the data all at once in one string at the end",
          },
          { value: true, name: "Split by lines, send them as they arrive" },
        ],
      },
      {
        type: "list",
        name: "json",
        message:
          "Should the data be parsed as JSON ? (if you selected split by lines, it means each line has to be a JSON object)",
        choices: [
          { value: false, name: "no" },
          { value: true, name: "yes" },
        ],
      },
    ]);
    config = { ...config, ...answers };
  }

  return config;
};
/*
interface RepoConfig {
  package: string;
  dataType?: string;
  encoding?: string;
  split?: boolean;
  json?: boolean;
  linesAggregation?: string;
}*/
const buildDataPipeline = (config: RepoConfig) => {
  const zu = "@zintapp/utils";
  const ro = "rxjs/operators";
  const toImport: { [a: string]: string[] } = { [zu]: [], [ro]: [] };
  const steps = [];
  let outputDataType = "none";

  if (config.dataType === "binary") {
    steps.push("waitForAllData()");
    toImport[zu].push("waitForAllData");
    outputDataType = "Buffer";
    //
  } else if (config.dataType === "text") {
    const decodingStep = `decode('${config.encoding}')`;
    if (config.split) {
      steps.push(decodingStep);
      toImport[zu].push("decode");
      outputDataType = "string";

      steps.push("splitByLines()");
      toImport[zu].push("splitByLines");
      outputDataType = "string";

      if (config.json) {
        steps.push("map(o => JSON.parse(o))");
        toImport[ro].push("map");
        outputDataType = "any";
      }
    } else {
      steps.push("waitForAllData()");
      toImport[zu].push("waitForAllData");
      outputDataType = "Buffer";

      steps.push(decodingStep);
      toImport[zu].push("decode");
      outputDataType = "string";

      if (config.json) {
        steps.push("map(o => JSON.parse(o))");
        toImport[ro].push("map");
        outputDataType = "any";
      }
    }
  }
  const dataProcessingImports = Object.keys(toImport)
    .filter((o) => toImport[o].length > 0)
    .map((mod) => `import { ${toImport[mod].join(", ")} } from '${mod}'`)
    .join("\n");

  const dataPipeline = steps.join(",\n        ");
  return {
    dataProcessingImports,
    dataPipeline,
    outputDataType,
  };
};

const buildRepo = async (outDir: string, config: RepoConfig) => {
  const componentNameCamelCase = config.component.replace(/^./, (o) =>
    o.toUpperCase()
  );
  const componentNameLowerCase = config.component.toLowerCase();
  const outPath = join(process.cwd(), outDir);

  const { dataProcessingImports, dataPipeline, outputDataType } =
    buildDataPipeline(config);

  const created = await mkdirp(outPath);
  if (created === undefined) {
    /* directory exists, check if empty */
    const files = await readdir(outPath);
    if (files.length > 0) {
      console.error(`abort! directory ${outPath} not empty.`);
      process.exit(1);
    }
  }

  await copy(join(__dirname, "repo_template"), outPath);

  const replaced = await replaceInFile({
    files: join(outDir, "**", "*.template"),
    from: [
      /\/\*\*\* dataProcessingImports \*\*\*\//g,
      /\/\*\*\* dataPipeline \*\*\*\//g,
      /\/\*\*\* outputDataType \*\*\*\//g,
      /\/\*\*\* componentNameCamelCase \*\*\*\//g,
      /\/\*\*\* componentNameLowerCase \*\*\*\//g,
    ],
    to: [
      dataProcessingImports,
      dataPipeline,
      outputDataType,
      componentNameCamelCase,
      componentNameLowerCase,
    ],
    countMatches: true,
  });

  replaced.forEach(async ({ file }) => {
    const newName = file.replace(/\.template$/, "");
    await rename(file, newName);
  });
};

const main = async () => {
  const program = new Command();

  program
    .name("create-zint-component")
    .description(
      "a small CLI to facilitate creation of micro-frontends to be used with Zint"
    )
    .version("0.0.1")
    .argument("<project-directory>", "directory to create the repo")
    .showHelpAfterError()
    .parse();

  const outDir = program.args[0];

  const config = await inquireConfig();

  await buildRepo(outDir, config);
};
main();
