function(doc) {
  if (doc.type && doc.type === 'server') {
    emit([doc.index || 0], {
      rev:doc._rev,
      id:doc._id,
      server: doc.server,
      database:doc.database,
      username:doc.username,
      password:doc.password
    });
  }
};