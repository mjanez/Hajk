import l from "../../common/logger";
import fs from "fs";
import path from "path";

class ConfigService {
  constructor() {
    l.info("Initiating ConfigService");
    // TODO: As reading files is expansive, we can read all
    // JSON files on init and keep then in-memory. Subsequent
    // reads will be served from this in-memory store.
    // We should also implement an update-store method, perhaps
    // have a global bus (using EventEmitter?), so we can trigger
    // re-reads from FS into our in-memory store.
  }
  async getMapConfig(map) {
    l.info(`${this.constructor.name}.getMapConfig(${map})`);
    try {
      const pathToFile = path.join(process.cwd(), "App_Data", `${map}.json`);
      const text = await fs.promises.readFile(pathToFile, "utf-8");
      const json = await JSON.parse(text);
      return json;
    } catch (error) {
      return { error };
    }
  }

  async exportMapConfig(map = "layers", format = "json", next) {
    l.info(`${this.constructor.name}.getMapConfig(${map})`);
    // Obtain layers definition as JSON. It will be needed
    // both if we want to grab all available layers or
    // describe a specific map config.
    const layersConfig = await this.getMapConfig("layers");

    // Create a Map, indexed with each map's ID to allow
    // fast lookup later on
    const layersById = new Map();

    // Populate the Map so we'll have {layerId: layerCaption}
    for (const type in layersConfig) {
      layersConfig[type].map((layer) =>
        layersById.set(layer.id, {
          name: layer.caption,
          ...(layer.layers &&
            layer.layers.length > 1 && { subLayers: layer.layers }),
        })
      );
    }

    // If a list of all available layers was requested, we're
    // done here and can return the Map.
    if (map === "layers") return Object.fromEntries(layersById); // TODO: Perhaps sort on layer name?

    // If we got this far, we now need to grab the contents of
    // the requested map config.
    const mapConfig = await this.getMapConfig(map);

    // Some clumsy error handling
    if (mapConfig.error) {
      next(mapConfig.error);
      return;
    }

    // Grab LayerSwitcher's setup
    const { groups, baselayers } = mapConfig.tools.find(
      (tool) => tool.type === "layerswitcher"
    ).options;

    // Define a recursive function that will grab contents
    // of a group (and possibly all groups beneath).
    const decodeGroup = (group) => {
      const g = {};
      // First grab current group's name
      if (group.name) g.name = group.name;

      // Next assign names to all layers
      if (Array.isArray(group.layers))
        g.layers = group.layers.map((l) => layersById.get(l.id));

      // Finally, go recursive if there are subgroups
      if (group.groups && group.groups.length !== 0) {
        g.groups = group.groups.map((gg) => decodeGroup(gg));
      }

      return g;
    };

    // Prepare the object that will be returned
    const output = {
      baselayers: [],
      groups: [],
    };

    // Grab names for base layers and put into output
    baselayers.map((l) => output.baselayers.push(layersById.get(l.id)));

    // Take all groups and call our decode method on them
    output.groups = groups.map((group) => decodeGroup(group));

    if (format === "json") return output;

    // Throw error if output is not yet implemented
    next(Error(`Output format ${format} is not implemented.`));
  }

  async getAvailableMaps() {
    l.info(`${this.constructor.name}.getAvailableMaps()`);
    try {
      const dir = path.join(process.cwd(), "App_Data");
      // List dir contents, the second parameter will ensure we get Dirent objects
      const dirContents = await fs.promises.readdir(dir, {
        withFileTypes: true,
      });
      const availableMaps = dirContents
        .filter(
          (entry) =>
            // Filter out only files (we're not interessted in directories).
            entry.isFile() &&
            // Filter out the special case, layers.json file.
            entry.name !== "layers.json" &&
            // Only JSON files
            entry.name.endsWith(".json")
        )
        // Create an array using name of each Dirent object, remove file extension
        .map((entry) => entry.name.replace(".json", ""));
      return availableMaps;
    } catch (error) {
      return { error };
    }
  }
}

export default new ConfigService();
