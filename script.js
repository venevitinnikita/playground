window.onload = function () {
    gantt.init("gantt_div");
    // gantt.load("content.xml", "xml");
    gantt.load("example-data.xml", "xml");
}

var x2js = new X2JS();

gantt.xml.parse = function (text, loader) {
    var data = {};
    if (text.indexOf('anygant') < 0) {
        loader = this._getXML(text, loader);
        var evs = data.data = [];
        var xml = gantt.ajax.xpath("//task", loader);

        for (var i = 0; i < xml.length; i++)
            evs[i] = this._xmlNodeToJSON(xml[i]);

        data.collections = this._getCollections(loader);
    } else {
        var json = x2js.xml_str2json(text).anygantt;

        processDataGrid(json.datagrid);

        data.data = [{ id: 1, text: "Project #1", start_date: "01-04-2013", duration: 18 },
            { id: 2, text: "Task #1", start_date: "02-04-2013", duration: 8, parent: 1 },
            { id: 3, text: "Task #2", start_date: "11-04-2013", duration: 8, parent: 1 }];
        data.collections = [];
    }

    return data;
}

function processDataGrid(datagrid) {
    gantt.config.columns = [];
    datagrid.columns.column.forEach(function (column, i, array) {
        var header = column.header.text;

        var ganttColumn = {};
        // Пока в качестве name используется header
        ganttColumn.name = header;
        ganttColumn.header = header;
        if (column._width) ganttColumn.width = column._width;
        switch (column._cell_align) {
            case "Center":
                ganttColumn.align = "center";
                break;
        }

        gantt.config.columns[i] = ganttColumn;
    });
}



// gantt.xml.parse = function (text, loader) {
//     loader = this._getXML(text, loader);
//     var data = {};

//     var evs = data.data = [];
//     var xml = gantt.ajax.xpath("//task", loader);

//     for (var i = 0; i < xml.length; i++)
//         evs[i] = this._xmlNodeToJSON(xml[i]);

//     data.collections = this._getCollections(loader);
//     return data;
// }