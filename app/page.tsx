import fs from "fs";
import path from "path";

export default function Home() {
  const raw = fs.readFileSync(path.join(process.cwd(), "public", "landing.html"), "utf-8");

  // Extract just the content between <body> and </body>, plus the <style> block
  const styleMatch = raw.match(/<style>([\s\S]*?)<\/style>/);
  const bodyMatch = raw.match(/<body[^>]*>([\s\S]*?)<\/body>/);

  const style = styleMatch ? styleMatch[1] : "";
  const body = bodyMatch ? bodyMatch[1] : raw;

  // Extract any <link> tags (fonts, etc)
  const links = (raw.match(/<link[^>]*>/g) || []).filter(
    (l: string) => l.includes("fonts.googleapis.com") || l.includes("font")
  );

  return (
    <>
      {links.map((link: string, i: number) => (
        <div key={i} dangerouslySetInnerHTML={{ __html: link }} />
      ))}
      <style dangerouslySetInnerHTML={{ __html: style }} />
      <div dangerouslySetInnerHTML={{ __html: body }} />
    </>
  );
}
