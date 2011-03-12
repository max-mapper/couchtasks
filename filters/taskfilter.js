function (doc, req) {
  if (doc._id.match("_design")) {
    return true;
  }
  return doc.type && doc.type === "task";
}