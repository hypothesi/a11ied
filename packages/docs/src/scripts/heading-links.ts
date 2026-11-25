/**
 * Turns each section heading into a link to itself, so a reader can copy the address of
 * one section. The heading keeps its text as its accessible name.
 */
for (const heading of document.querySelectorAll('article h2[id]')) {
   const link = document.createElement('a');

   link.className = 'heading-link';
   link.href = `#${heading.id}`;
   link.append(...heading.childNodes);
   heading.append(link);
}
