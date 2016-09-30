function onLoad() {
    gantt.init("gantt_div");
    gantt.load("content.xml", "xml");

    gantt.xml.parse = function (text, loader) {
        loader = this._getXML(text, loader);
        var data = {};

        var evs = data.data = [];
        var xml = gantt.ajax.xpath("//task", loader);

        for (var i = 0; i < xml.length; i++)
            evs[i] = this._xmlNodeToJSON(xml[i]);

        data.collections = this._getCollections(loader);
        return data;
    }
}
window.onload = onLoad;