/** The document a virtual session reads before a page is attached. */
export const defaultVirtualDocument: { html: string; url: string } = {
   html: [
      '<!doctype html>',
      '<html lang="en">',
      '   <body>',
      '      <main>',
      '         <h1>a11ied virtual target</h1>',
      '         <p>No live page is attached to this driver session yet.</p>',
      '         <button type="button">Continue</button>',
      '      </main>',
      '   </body>',
      '</html>',
      '',
   ].join('\n'),
   url: 'about:a11ied-virtual',
};
