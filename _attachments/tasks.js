window.log = function(){
  log.history = log.history || [];   // store logs to an array for reference
  log.history.push(arguments);
  if(this.console){
    console.log( Array.prototype.slice.call(arguments) );
  }
};

$.ajaxSetup({
    cache: false
});

var Tasks = (function () {

  var mainDb  = document.location.pathname.split("/")[1],
      editing = false,
      router  = new Router(),
      tasks   = [],
      servers = [],
      $db     = $.couch.db(mainDb);
  
  router.get(/^(!)?$/, function () {
    $db.view('couchtasks/tasks', {
      descending: true,
      success : function (data) {
        tasks = getValues(data.rows);
        render("#home_tpl", {notes:tasks});
        $("#notelist").sortable();
      }
    });
  });

  // router.get('!/complete/', {
  //   localVar: {},
  //   load: function() {
      
  //   },
  //   unload: function() {
  //   }
  // })
  
  router.get('!/complete/', function (id) {
    $db.view('couchtasks/complete', {
      descending: true,
      success : function (data) {
        tasks = getValues(data.rows);
        render("#complete_tpl", {notes:tasks});
        $("#notelist").sortable();
      }
    });
  });

  router.get('!/sync/', function (id) {
    $db.view('couchtasks/servers', {
      success : function (data) {
        servers = getValues(data.rows);
        render("#sync_tpl", {servers:servers});
      }
    });
  });

  router.get('!/:id/', function (id) {
    showNote(id, false);
  });

  router.post('add_server', function (e, details) {
    details.type = "server";
    $db.saveDoc(details, {
      "success": function() {
        router.refresh();
      }
    });
  });

  function getValues(src) {
    var arr = [], i;
    for (i = 0; i < src.length; i++) {
      arr.push(src[i].value);
    }
    return arr;
  }
  
  function render(tpl, data) {
    data = data || {};
    $('#content').html(Mustache.to_html($(tpl).html(), data));
  };

  function jsonStorage(key, val) {
    if (val) {
      localStorage[key] = JSON.stringify(val);
      return true;
    } else {
      return localStorage && localStorage[key] &&
        JSON.parse(localStorage[key]) || false;
    }
  };
  
  function findTask(id) {
    for(var i = 0; i < tasks.length; i++) {
      if (tasks[i].id === id) {
        return tasks[i];
      };
    }
    return false;
  }
  
  function newTask(title) {
    var index = findTask($("#notelist li.task:eq(1)").attr("data-id"));
    index = index && index.index + 1 || 1;
    $db.saveDoc({
      "type":"task",
      index: index,
      "status":"active",
      "title":title,
      "tags":[],
      "notes":""
    }, {
      "success": function (data) {
        router.refresh();
      }
      });
    };

  function startNewTask() {
    if (!editing) { 
      editing = true;
      $($("#newtask_tpl").html()).insertAfter($("#notelist .header"));
      $("#newtask")[0].focus();
    } else {
      editing = false;
      $("#newtaskwrapper").remove();
    }
  };

  function doReplication(obj) {
    $("#feedback").text("Starting Replication");
    $.ajax({
      "url": "/_replicate",
      "type": 'POST',
      "data": JSON.stringify(obj),
      contentType : "application/json",
      dataType : "json",
      "success": function () {
        $("#feedback").text("Replication Complete");
     }
    });
  };

  function createUrl(username, password, server, database) {
    if (username === "") {
      return "http://" + server + "/" + database;
    } else {
      return "http://" + username + ":" + password + "@"
        + server + "/" + database;
    }
  };


  
  // I dont like these global events, they are bound to the page permanently
  // so may cause conflicts
  function bindDomEvents() {

    $("#addnewtask").live("mousedown", function() {
      newTask($("#newtask").val());
    });

    $(".push").live("mousedown", function(e) {
      var li = $(e.target).parents("li");
      doReplication({
        "target" : createUrl(li.attr("data-username"), li.attr("data-password"),
                             li.attr("data-server"), li.attr("data-database")),
        "source" : mainDb
      });      
    });

    $(".pull").live("mousedown", function(e) {
      var li = $(e.target).parents("li");
      doReplication({
        "target" : mainDb,
        "source" : createUrl(li.attr("data-username"), li.attr("data-password"),
                             li.attr("data-server"), li.attr("data-database"))
      });
    });
                          
      
    $("#newtask").live("keydown", function(e) {
      if (e.which === 13) { 
        if ($(this).val() != "") {
          newTask($(this).val());
        } else {
          $("#newtaskwrapper").remove();
          
        }
      }
    });

    $("#add").live("mousedown", function(e) {
      e.preventDefault();
      startNewTask();
    });

    $(".delete").live("mousedown", function(e) {
      e.preventDefault();
      var li = $(e.target).parents("li");
        $db.removeDoc({_id: li.attr("data-id"), _rev: li.attr("data-rev")}, {
            success: function() {
                li.slideUp("medium", function () { li.remove(); });
            }
        });
    });

    $(".restore").live("mousedown", function(e) {
      e.preventDefault();
      var li = $(e.target).parents("li"),
          id = li.attr("data-id"),
          url = "/" + mainDb + "/_design/couchtasks/_update/update_status/" + id
        + "?status=active";
      $.ajax({
        url: url,
        type: "PUT",
        contentType:"application/json",
        datatype:"json",
        success: function() {
          li.addClass("deleted");
        }
      });
    });

    $(".checker").live("change", function(e) {

      var status = $(this).is(":checked") ? "complete" : "active",
          li = $(e.target).parents("li"),
          id = li.attr("data-id"),
          url = "/" + mainDb + "/_design/couchtasks/_update/update_status/" + id
        + "?status=" + status;
      
      $.ajax({
        url: url,
        type: "PUT",
        contentType:"application/json",
        datatype:"json",
        success: function() {
          if (status === "complete") { 
            li.addClass("deleted");
          } else {
            li.removeClass("deleted");
          }
        }
      });
    });
    
    $(document).bind("keydown", function(e) {
      if (e.which == 13 && !editing) {
        if (!editing) {
          startNewTask();
        }
      } else if (e.which == 13 && editing) {
        $("#newtask").blur();
        editing = false;
      }
    });

  };

  bindDomEvents();
  router.init();

})();