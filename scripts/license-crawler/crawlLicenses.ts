import { exec as originalExec } from "child_process";
import fs from "node:fs";
import path from "pathe";
import pc from "picocolors";
import { PackageJson } from "type-fest";

const exec = (command: string) => {
  return new Promise<string>((resolve, reject) => {
    originalExec(command, (err, stdout) => {
      if (err) {
        reject(err);
      } else {
        resolve(stdout);
      }
    });
  });
};

async function getLicenses() {
  const info = await exec("yarn --json workspaces info");
  const packages = JSON.parse(info) as { data: string };
  const data = JSON.parse(packages.data) as { location: string }[];
  const directDependencies = new Set();

  Object.values(data).forEach(({ location }) => {
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), location, "package.json"), "utf-8"),
    ) as PackageJson;
    if (packageJson.dependencies !== undefined) {
      Object.keys(packageJson.dependencies).forEach(name => directDependencies.add(name));
    }
    if (packageJson.devDependencies !== undefined) {
      Object.keys(packageJson.devDependencies).forEach(name => directDependencies.add(name));
    }
  });

  const licencesOutput = await exec("yarn --json licenses list");
  const licencesOutputLines = licencesOutput.trim().split("\n");
  const licenses = (
    JSON.parse(licencesOutputLines[licencesOutputLines.length - 1] as string) as {
      data: {
        head: [string, string, string, string, string, string];
        body: [string, string, string, string, string, string][];
      };
    }
  ).data;
  const directDependenciesLicenses = licenses.body
    .filter(([name]) => directDependencies.has(name) && !name.startsWith("@swan-io/"))
    .map(
      ([name, version, license, url, vendorUrl, vendorName]) =>
        [
          name,
          version,
          license,
          url.replace(/^git\+/, ""),
          vendorUrl.replace(/^git\+/, ""),
          vendorName,
        ] as const,
    );
  return {
    head: licenses.head,
    licenses: directDependenciesLicenses,
  };
}

async function report() {
  const { head, licenses } = await getLicenses();
  fs.writeFileSync(
    path.join(process.cwd(), "LICENSE_REPORT.md"),
    `# License report

${head.join(" | ")}
${head.map(() => "---").join(" | ")}
${licenses.map(items => items.join(" | ")).join("\n")}
`,
    "utf-8",
  );
}

const DENY_LIST = ["GPL", "AGPL"];
const DENY_LIST_REGEX = new RegExp(DENY_LIST.map(item => `\\b${item}\\b`).join("|"));

async function check() {
  const { licenses } = await getLicenses();
  let hasError = false;
  console.log(`${pc.white("---")}`);
  console.log(`${pc.green("Swan license check")}`);
  console.log(`${pc.white("---")}`);
  console.log("");

  licenses.forEach(([name, version, license]) => {
    if (DENY_LIST_REGEX.exec(license)) {
      console.error(
        `${pc.blue(name)}@${pc.gray(version)} has unauthorized license ${pc.red(license)}`,
      );
      hasError = true;
    }
  });
  if (hasError) {
    process.exit(1);
  } else {
    console.log(pc.green("All good!"));
  }
}

async function main() {
  if (process.argv.includes("--check")) {
    await check();
  }

  if (process.argv.includes("--report")) {
    void report();
  }
}

void main();
