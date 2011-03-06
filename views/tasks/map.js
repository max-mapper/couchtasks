function(doc) {
  if (doc.type && doc.type === 'task' && doc.status === "active") {
    emit([doc.index || 0], {
      index: doc.index || 0,
      title:doc.title,
      rev:doc._rev,
      id:doc._id
    });
  }
};