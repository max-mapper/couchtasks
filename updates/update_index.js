function (doc, req) {
  doc.index = parseFloat(req.query.index);
  return [doc, "updated"];
}