import fs from "fs";
import path from "path";

export default function Home() {
  const raw = fs.readFileSync(path.join(process.cwd(), "public", "landing.html"), "utf-8");

  // Extract style, body, and font links from the full HTML
  const styleMatch = raw.match(/<style>([\s\S]*?)<\/style>/);
  const bodyMatch = raw.match(/<body[^>]*>([\s\S]*?)<\/body>/);

  const style = styleMatch ? styleMatch[1] : "";
  const body = bodyMatch ? bodyMatch[1] : raw;

  const links = (raw.match(/<link[^>]*>/g) || []).filter(
    (l: string) => l.includes("fonts.googleapis.com") || l.includes("font")
  );

  // Inject a script that enables smooth scrolling for anchor links
  const scrollScript = `
    document.addEventListener('click', function(e) {
      var link = e.target.closest('a[href^="#"]');
      if (!link) return;
      var id = link.getAttribute('href').substring(1);
      var target = document.getElementById(id);
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        history.pushState(null, '', '#' + id);
      }
    });
  `;

  return (
    <>
      {links.map((link: string, i: number) => (
        <div key={i} dangerouslySetInnerHTML={{ __html: link }} />
      ))}
      <style dangerouslySetInnerHTML={{ __html: style }} />
      <div dangerouslySetInnerHTML={{ __html: body }} />
      <script dangerouslySetInnerHTML={{ __html: scrollScript }} />
    </>
  );
}
