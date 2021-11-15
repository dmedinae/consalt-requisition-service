"use strict";

const { BaseDao, BaseObject } = require("@inlaweb/base-node");
const Constants = require("../../commons/constants/objects");

/**
 * Service class.
 * @extends BaseObject
 */
class Service extends BaseObject {
    /**
     * Create a Service.
     */
    constructor() {
        super();
        this.dao = new BaseDao();
        this.table = process.env.TABLE_NAME;
        this.permissionTable = process.env.TABLE_PERMISSIONS_NAME;
    }

    /**
     * Initialize the variables.
     * @param {object} event - The event object.
     * @param {object} context - The context object.
     */
    initialize(event, context) {
        super.initialize(event, context);
        this.dao.initialize(event, context);
    }

    /**
     * Function to save a item.
     * @return {object} The object with the respective PK.
     */
    async queryProccess() {
        try {
            // Se valida permiso
            await this.dao.validatePermissions(this.permissionTable, Constants.ENTITY, ["PROCCESS"]);

            const body = this.event.body;

            let params = {
                indexName: "",
                parameters: [
                    { name: "PK", value: body.PK, operator: "=" }
                ],
                projectionExpression: Constants.PK_PROJECTION
            };
            const requisition = await this.dao.query(this.table, params);

            if (!requisition.length) {
                throw this.createResponse("REQI_NO_FOUND", null, {});
            }

            const header = requisition.filter(elem => elem.PK === elem.SK);

            const project = await this.dao.get(this.table, header.project, header.project, "storer,frameProject");
            const frame = project.frameProject ? await this.dao.get(this.table, project.frameProject, project.frameProject, "storer") : undefined;
            let inventoryPK = project.frameProject ? project.frameProject.replace("FRAM", "INVF") : header.project.replace("PROJ", "INVP");

            if ((frame && frame.storer !== this.tokenData["custom:id"]) || (!frame && project.storer !== this.tokenData["custom:id"])) {
                throw this.createResponse("INVALID_REQUEST", null, {});
            }

            const items = requisition.filter(elem => elem.PK !== elem.SK);

            let itemsPromises = [];
            for (let i = 0; i < items.length; i++) {
                itemsPromises.push(this.addInventoryAvailableQuantityToItem(items[i], inventoryPK));
                if (itemsPromises.length >= 10 || i === (items.length - 1)) {
                    await Promise.all(itemsPromises).catch(error => {
                        this.createLog("error", "Service error", error);
                    });
                    itemsPromises = [];
                }
            }

            return requisition;
        } catch (error) {
            this.createLog("error", "Service error", error);
            throw this.createResponse("INTERNAL_ERROR", null, error);
        }
    }

    async addInventoryAvailableQuantityToItem(item, PK) {
        let inventoryItem = await this.dao.get(this.table, PK, item.item, "quantity");
        if (!inventoryItem) {
            inventoryItem = {
                quantity: 0
            }
        }
        item.inventoryQuantity = inventoryItem.quantity;
    }
}

module.exports = Service;
