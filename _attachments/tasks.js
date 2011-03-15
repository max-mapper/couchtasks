/*jshint white:true */

window.log = function(){
  log.history = log.history || [];
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
  isMobile = Utils.isMobile(),
  editing = false,
  router  = new Router(),
  current_tpl = null,
  slidePane = null,
  docs    = {},
  tasks   = [],
  servers = [],
  zIndex  = 0,
  currentPane = "pane1",
  $db     = $.couch.db(mainDb);

  var templates = {
    addserver_tpl : {
      transition: "slideUp",
      events: { '.deleteserver' : {'event': 'click', 'callback' : deleteServer}}
    },
    addtask_tpl : {transition: "slideUp"},
    task_tpl : { transition: "slideHorizontal" },
    sync_tpl : {
      transition: "slideHorizontal",
      events : {
        '.sync' : {'event': 'click', 'callback' : doSync}
      }
    },
    home_tpl : {
      transition : "slideHorizontal",
      events : {
        '.checker' : {'event': 'change', 'callback' : markDone},
        '.task' : {'event': 'click', 'callback' : viewTask},
        '.delete' : {'event': 'click', 'callback' : deleteTask}
      },
      init : function(dom) {
        $("#notelist", dom).sortable({
          axis:'y',
          distance:30
        });

        $("#notelist", dom).bind( "sortstop", function(event, ui) {
          var index = createIndex(ui.item);
          if (index !== false) {
            updateIndex(ui.item.attr("data-id"), index);
          }
        });
      }
    }
  };

  templates.complete_tpl = templates.home_tpl;

  router.get(/^(!)?$/, function () {
    $db.view('couchtasks/tasks', {
      descending: true,
      success : function (data) {
        tasks = getValues(data.rows);
        render("home_tpl", "#home_content", {notes:tasks});
      }
    });
  });

  router.get('!/add_server/', function () {
    $db.view('couchtasks/servers', {
      success : function (data) {
        servers = getValues(data.rows);
        render("addserver_tpl", "#add_server", {servers:servers});
      }
    });
  });

  router.get('!/add_task/', function () {
    render("addtask_tpl", "#add_content");
  });

  router.get('!/complete/', function (id) {
    $db.view('couchtasks/complete', {
      descending: true,
      success : function (data) {
        tasks = getValues(data.rows);
        render("complete_tpl", "#complete_content", {notes:tasks});
      }
    });
  });

  router.get('!/sync/', function (id) {
    $db.view('couchtasks/servers', {
      success : function (data) {
        servers = getValues(data.rows);
        render("sync_tpl", "#sync_content", {servers:servers});
      }
    });
  });

  router.get('!/task/:id/', function (id) {
    $db.openDoc(id, {
      success: function(doc) {
        docs[doc._id] = doc;
        doc.completed = doc.status === "complete" ? "checked='checked'" : "";
        render("task_tpl", null, doc);
      }
    });
  });

  router.post('edit', function (e, details) {
    var doc = docs[details.id];
    doc.notes = details.notes;
    doc.status = details.completed && details.completed === "on"
      ? "complete" : "active";
    $db.saveDoc(doc, {"success": router.back});
  });

  router.post('add_server', function (e, details) {
    details.type = "server";
    $db.saveDoc(details, {"success": router.back});
  });

  router.post('add_task', function (e, details) {
    newTask(details.title, details.notes, router.back);
  });

  function markDone(e) {

    var status = {
      "home_tpl": {"checked": "complete", "unchecked": "active"},
      "complete_tpl": {"checked": "active", "unchecked": "complete"}
    };

    var cur_status = status[current_tpl][$(this).is(":checked")
                                         ? "checked" : "unchecked"],
    li = $(e.target).parents("li"),
    id = li.attr("data-id"),
    url = "/" + mainDb + "/_design/couchtasks/_update/update_status/" + id
      + "?status=" + cur_status;

    $.ajax({
      url: url,
      type: "PUT",
        contentType:"application/json",
        datatype:"json",
        success: function() {
          if (cur_status === "complete" && current_tpl === "home_tpl" ||
              cur_status === "active" && current_tpl === "complete_tpl") {
            li.addClass("deleted");
          } else {
            li.removeClass("deleted");
          }
        }
    });
  };

  function updateIndex(id, index) {
    var url = "/" + mainDb + "/_design/couchtasks/_update/update_index/" + id +
      "?index=" + index;
    $.ajax({
      url: url,
      type: "PUT",
      contentType:"application/json",
      datatype:"json"
    });
  }

  function createIndex(el) {

    var before = el.prev("li.task"),
        after = el.next("li.task");

    if (before.length === 0 && after.length === 0) {
      return false;
    } else if (before.length === 0) {
      return parseInt(after.attr("data-index"), 10) + 1;
    } else if (after.length === 0) {
      return parseInt(before.attr("data-index"), 10) - 1;
    } else {
      return (parseInt(before.attr("data-index"), 10) +
              parseInt(after.attr("data-index"), 10)) / 2;
    }
  }

  function getValues(src) {
    var arr = [], i;
    for (i = 0; i < src.length; i++) {
      arr.push(src[i].value);
    }
    return arr;
  }

  function render(tpl, dom, data) {

    oldPane = (currentPane === "#pane1") ? "#pane1" : "#pane2";
    currentPane = (currentPane === "#pane1") ? "#pane2" : "#pane1";
    $(oldPane).css({'z-index':1});
    $(currentPane).empty().css({'z-index':2});

    data = data || {};
    $("body").removeClass(current_tpl).addClass(tpl);

    var rendered = Mustache.to_html($("#" + tpl).html(), data),
    $pane = $("<div class='content'>" + rendered + "</div>");
    createCheckBox($pane);

    // Bind this templates events
    var events = templates[tpl] && templates[tpl].events;
    if (events) {
      for (var key in events) {
        $(key, $pane).bind(events[key].event + ".custom", events[key].callback);
      }
    }

    if (templates[tpl] && templates[tpl].init) {
      templates[tpl].init($pane);
    }

    var transition = templates[tpl] && templates[tpl].transition;
    if (transition === 'slideUp') {
      slidePane = $pane.css({position:"absolute", top:999, 'z-index': 3})
        .appendTo("body").animate({top:0});
    } else if (slidePane) {
      $pane.appendTo($(currentPane));
      $("#wrapper").css({left: -$(currentPane).position().left});
      slidePane.animate({top:999}, {complete: function () {
        slidePane.remove();
        slidePane = null;
      }});
    } else {
      if (current_tpl) {
        if (tpl === "task_tpl" ||
            (tpl === "complete_tpl" && current_tpl === "home_tpl") ||
            (tpl === "sync_tpl" && current_tpl === "home_tpl") ||
            (tpl === "sync_tpl" && current_tpl === "complete_tpl")) {
          $(currentPane).css({left:$(oldPane).position().left + $(oldPane).width()});
        } else {
          $(currentPane).css({left:$(oldPane).position().left - $(oldPane).width()});
        }
      }
      $pane.appendTo($(currentPane));
      $("#wrapper").animate({left: -$(currentPane).position().left});
    }


    current_tpl = tpl;
  }

  function findTask(id) {
    for(var i = 0; i < tasks.length; i++) {
      if (tasks[i].id === id) {
        return tasks[i];
      }
    }
    return false;
  }

  function newTask(title, notes, callback) {
    var index = findTask($("#notelist li.task:eq(1)").attr("data-id"));
    index = index && index.index + 1 || 1;
    $db.saveDoc({
      "type":"task",
      index: index,
      "status":"active",
      "title":title,
      "tags":[],
      "notes":notes
    }, {
      "success": function (data) {
        callback();
      }
    });
  }

  function doReplication(obj, callbacks) {
    $.ajax({
      url: "/_replicate",
      type: 'POST',
      data: JSON.stringify(obj),
      contentType : "application/json",
      dataType : "json",
      success: callbacks.success,
      error: callbacks.error
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

  function viewTask(e) {
    if (!$(e.target).is("li.task") && e.target.nodeName !== 'SPAN') {
      return;
    }
    document.location.href = "#!/task/" + $(this).attr("data-id") + "/";
  }

  function doSync(e) {

    var li = $(e.target).parents("li").addClass("syncing"),
    server = li.attr("data-server"),
    database = li.attr("data-database"),
    user = li.attr("data-username"),
    pass = li.attr("data-password");


    var error = function() {
      $("#feedback").addClass("error").text("Sync Failed!").show();
      li.removeClass("syncing");
    };

    doReplication({
      create_target:true,
      filter: "couchtasks/taskfilter",
      target : createUrl(user, pass, server, database),
      source : mainDb
    }, {
      "success" : function() {
        doReplication({
          filter: "couchtasks/taskfilter",
          target : mainDb,
          source : createUrl(user, pass, server, database)
        }, { "success" : function () {
          $("#feedback").addClass("success").text("Sync Complete!").show();
          li.removeClass("syncing");
        }, error: error})
      }, error: error});
  };

  function deleteServer(e) {
    e.preventDefault();
    var li = $(e.target).parents("li");
    $db.removeDoc({_id: li.attr("data-id"), _rev: li.attr("data-rev")}, {
      success: function() {
        li.remove()
      }
    });
  };

  function deleteTask(e) {
    e.preventDefault();
    $(e.target).css({opacity:1});
    var li = $(e.target).parents("li");
    $db.removeDoc({_id: li.attr("data-id"), _rev: li.attr("data-rev")}, {
      success: function() {
        li.fadeOut("medium", function () {
          li.remove();
        });
      }
    });
  };

  function createCheckBox(parent) {
    $("input[type=checkbox]", parent).each(function() {
      var $input = $(this).wrap("<div class='checkbox'></div>");
      var $wrapper = $(this).parent(".checkbox").append("<div />");
      if ($input.is(":checked")) {
        $wrapper.addClass("checked");
      }
      $wrapper.bind("click", function(){
        $wrapper.toggleClass("checked");
        $input.attr("checked", !$input.is(":checked")).change();
      });
    });
  };

  $(window).bind("resize", function () {
    $(".pane").width($("body").width());
  });
  $(window).resize();

  router.init();

})();