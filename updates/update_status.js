function (doc, req) {
    doc.status = req.query.status;
    return [doc, "updated"];
}