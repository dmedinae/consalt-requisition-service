"use strict";

const { BaseDao, BaseObject } = require("@inlaweb/base-node");
const { Utils } = require("@inlaweb/consalt-utils-node");
const Constants = require("../../commons/constants/objects");
const moment = require("moment-timezone");

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
    async update() {
        try {
            // Se valida permiso a la opción de creación
            const permission = await this.dao.validatePermissions(this.permissionTable, Constants.ENTITY, ["UPDATE"]);

            const transactionOperations = [];
            const body = this.event.body;

            // Se consulta la requisición actual y sus items
            const params = {
                indexName: "",
                parameters: [{ name: "PK", value: this.event.body.PK, operator: "=" }],
            };
            const currentRequisition = await this.dao.query(this.table, params);
            if (!currentRequisition.length) {
                throw this.createResponse("REQI_NO_FOUND", null, {});
            }

            if (permission === "OWNS" && currentRequisition[0].creationUser !== this.tokenData["cognito:username"]) {
                throw this.createResponse("UNAUTHORIZE_REQUEST", null, {});
            }

            // validate no duplicated items
            let itemValidation = [];
            for (let item of body.items) {
                if (itemValidation.includes(item.item)) {
                    throw this.createResponse("INVALID_REQUEST", null, {});
                }
                itemValidation.push(item.item);
            }

            const PK = body.PK;

            // Se obtiene el header
            const header = currentRequisition.filter(element => element.PK === element.SK)[0];
            if(!Constants.ALLOWED_UPDATE_STATUS.includes(header.status)) {
                throw this.createResponse("INVALID_REQUEST", null, {});
            }
            // Se completan datos en el header
            const requireDate = moment(new Date(body.requireDate)).format("YYYY-MM-DD");
            body.requireDate = requireDate;
            body.relation1 = header.relation1;
            body.relation2 = header.relation2;
            body.relation3 = header.relation3.replace(header.status, Constants.STATUS.PENDING_APPROVAL);
            body.relation4 = header.relation4.replace(header.status, Constants.STATUS.PENDING_APPROVAL);

            // Se obtienen los items a crear
            const itemsForCreate = body.items.filter(item => !item.SK);
            let PKITEM = itemsForCreate.length ? await this.dao.getId(this.table, Constants.ENTITY_ITRQ, itemsForCreate.length) : undefined;

            // Se consulta el projecto
            const project = await this.dao.get(this.table, header.project, header.project, "name,frameProject");
            if (!project) {
                throw this.createResponse("INVALID_REQUEST", null, {});
            }

            const processItems = {};

            // Se validan los items y se crean las operaciones en lotes de 10
            let itemsPromises = [];
            for (let i = 0; i < body.items.length; i++) {
                if (!body.items[i].SK || !processItems[body.items[i].SK]) {
                    processItems[body.items[i].SK] = 1;
                    body.items[i].project = body.project;
                    body.items[i].relation1 = body.relation1;
                    body.items[i].relation2 = body.relation2;
                    body.items[i].relation3 = body.relation3;
                    body.items[i].relation4 = body.relation4;
                    if (body.items[i].SK) {
                        transactionOperations.push(this.createItemUpdateOperation(body.items[i], PK))
                    } else {
                        body.items[i].SK = `${Constants.ENTITY_ITRQ}${PKITEM}`;
                        itemsPromises.push(
                            this.createItemOperation(body.items[i], PK, project.frameProject)
                        )
                        PKITEM++;
                    }
                }
                if (itemsPromises.length && itemsPromises.length >= 5 || i === (body.items.length - 1)) {
                    const resultItems = await Promise.all(itemsPromises).catch(error => {
                        this.createLog("error", "Service error", error);
                        throw this.createResponse("INVALID_REQUEST", null, {});
                    });
                    transactionOperations.push(...resultItems);
                    itemsPromises = [];
                }
            }

            // Se eliminan los items removidos
            const inItems = Object.keys(processItems);
            // Se agrega la PK de la remisión para removerla de los items a eliminar
            inItems.push(PK);
            for (let element of currentRequisition) {
                if (!inItems.includes(element.SK)) {
                    transactionOperations.push({ Delete: { TableName: this.table, Key: { PK, SK: element.SK } } });
                }
            }

            // Se construye el encabezado
            transactionOperations.push(this.createRequisitionObject(body))

            await this.dao.writeTransactions(transactionOperations, 24);
            await this.dao.audit(Constants.ENTITY, PK, "UPDATE");

            let url;

            if (this.event.body.fileExtension) {
                url = await Utils.getFileSignedUrlPut(`${Constants.ENTITY}/${PK}_${PK}.${body.fileExtension}`);
            }

            await Utils.updateProjectBudget(Constants.ENTITY, body, currentRequisition, header.status === Constants.STATUS.REJECTED);

            // Se retorna el id insertado
            return { PK, url };
        } catch (error) {
            console.log(error);
            this.createLog("error", "Service error", error);
            throw this.createResponse("INTERNAL_ERROR", null, error);
        }
    }

    /**
     * Function to format the data to save in DDB.
     * @param {object} payload - Data of the user.
     * @return {object} Dynamo object with the data to save.
     */
    createItemUpdateOperation(item, PK) {
        const itemUpdate = {
            relation1: item.relation1,
            relation2: item.relation2,
            relation3: item.relation3,
            relation4: item.relation4,
            quantity: item.quantity
        };
        const setAttributes = Object.keys(item);
        return this.dao.createUpdateParams(this.table, PK, item.SK, itemUpdate, setAttributes);
    }

    /**
     * Function to format the data to save in DDB.
     * @param {object} payload - Data of the user.
     * @return {object} Dynamo object with the data to save.
     */
    async createItemOperation(item, PK, frame) {
        //Se valida el item
        const itemCoding = await this.dao.get(this.table, item.item, item.item);
        if (!itemCoding || itemCoding.frame != frame) {
            throw this.createResponse("INVALID_REQUEST", null, {});
        }
        item.family = itemCoding.family;
        item.familyName = itemCoding.familyName;
        item.group = itemCoding.group;
        item.groupName = itemCoding.groupName;
        item.type = itemCoding.type;
        item.typeName = itemCoding.typeName;
        item.category = itemCoding.category;
        item.categoryName = itemCoding.categoryName;
        item.code = itemCoding.code;
        item.name = itemCoding.name;
        item.unity = itemCoding.unity;
        item.unityName = itemCoding.unityName;
        item.value = itemCoding.unitValue;
        item.affectBudget = itemCoding.affectBudget;
        return { Put: { TableName: this.table, Item: this.createItemObject(PK, item) } };
    }

    /**
     * Function to format the data to save in DDB.
     * @param {object} payload - Data of the user.
     * @return {object} Dynamo object with the data to save.
     */
    createItemObject(PK, item) {
        const creationDate = moment.tz(new Date(), "America/Bogota").format("YYYY-MM-DD");
        return {
            PK: PK,
            SK: item.SK,
            entity: Constants.ENTITY_ITRQ,
            relation1: item.relation1,
            relation2: item.relation2,
            relation3: item.relation3,
            relation4: item.relation4,
            item: item.item,
            project: item.project,
            family: item.family,
            familyName: item.familyName,
            group: item.group,
            groupName: item.groupName,
            type: item.type,
            typeName: item.typeName,
            category: item.category,
            categoryName: item.categoryName,
            code: item.code,
            name: item.name,
            unity: item.unity,
            unityName: item.unityName,
            value: item.value,
            quantity: item.quantity,
            affectBudget: item.affectBudget,
            creatorName: this.tokenData.name,
            creationUser: this.tokenData["cognito:username"],
            creationDate: creationDate,
        };
    }

    /**
     * Function to format the data to save in DDB.
     * @param {object} payload - Data of the user.
     * @return {object} Dynamo object with the data to save.
     */
    createRequisitionObject(payload) {
        const item = {
            relation1: payload.relation1,
            relation2: payload.relation2,
            relation3: payload.relation3,
            relation4: payload.relation4,
            requireDate: payload.requireDate,
            motive: payload.motive,
            status: Constants.STATUS.PENDING_APPROVAL,
            observations: payload.observations,
            fileExtension: payload.fileExtension,
        };
        const setAttributes = Object.keys(item);
        return this.dao.createUpdateParams(this.table, payload.PK, payload.PK, item, setAttributes);
    }
}

module.exports = Service;
