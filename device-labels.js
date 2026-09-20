(function () {
  const device = sessionStorage.getItem('currentDevice');
  if (!device || !/^ELITE[1-9]\d*$/.test(device)) return;
  document.title = document.title.replace(/ELITE1\b/g, device);
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (!['SCRIPT', 'STYLE'].includes(node.parentElement.tagName))
      node.nodeValue = node.nodeValue.replace(/ELITE1\b/g, device);
  }
})();
