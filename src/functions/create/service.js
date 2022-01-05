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
    async save() {
        try {
            // Se valida permiso a la opción de creación
            await this.dao.validatePermissions(this.permissionTable, Constants.ENTITY, ["CREATE"]);

            const transactionOperations = [];
            const body = this.event.body;
            // Se consulta el projecto
            const project = await this.dao.get(this.table, body.project, body.project, "name,frameProject,frameProjectName");
            if (!project) {
                throw this.createResponse("INVALID_REQUEST", null, {});
            }

            // validate no duplicated items
            let itemValidation = [];
            for (let item of body.items) {
                if (itemValidation.includes(item.item)) {
                    throw this.createResponse("INVALID_REQUEST", null, {});
                }
                itemValidation.push(item.item);
            }

            // Se completan datos en el header
            const creationDate = moment.tz(new Date(), "America/Bogota").format("YYYY-MM-DD");
            const requireDate = moment(new Date(body.requireDate)).format("YYYY-MM-DD");
            body.requireDate = requireDate;
            body.projectName = project.name;
            body.frame = project.frameProject;
            body.frameName = project.frameProject;
            body.creationDate = creationDate;
            body.relation1 = `${body.project}|${creationDate}`;
            body.relation2 = `${creationDate}`;
            body.relation3 = `${Constants.STATUS.PENDING_APPROVAL}|${body.project}`;
            body.relation4 = `${Constants.STATUS.PENDING_APPROVAL}|${project.frameProject}`;

            const PK = await this.dao.getId(this.table, Constants.ENTITY);
            body.PK = PK;

            let PKITEM = await this.dao.getId(this.table, Constants.ENTITY_ITRQ, body.items.length);

            // Se validan los items y se crean las operaciones en lotes
            let itemsPromises = [];
            for (let i = 0; i < body.items.length; i++) {
                body.items[i].SK = `${Constants.ENTITY_ITRQ}${PKITEM}`;
                body.items[i].project = body.project;
                body.items[i].creationDate = body.creationDate;
                body.items[i].relation1 = body.relation1;
                body.items[i].relation2 = body.relation2;
                body.items[i].relation3 = body.relation3;
                body.items[i].relation4 = body.relation4;
                itemsPromises.push(
                    this.createItemOperation(body.items[i], PK, project.frameProject)
                )
                PKITEM++;
                if (itemsPromises.length >= 5 || i === (body.items.length - 1)) {
                    const resultItems = await Promise.all(itemsPromises).catch(error => {
                        this.createLog("error", "Service error", error);
                        throw this.createResponse("INVALID_REQUEST", null, {});
                    });
                    transactionOperations.push(...resultItems);
                    itemsPromises = [];
                }
            }

            transactionOperations.push({ Put: { TableName: this.table, Item: this.createRequisitionObject(body, PK) } })

            await this.dao.writeTransactions(transactionOperations, 24);
            await this.dao.audit(Constants.ENTITY, PK, "CREATE");

            let url;

            if (this.event.body.fileExtension) {
                url = await Utils.getFileSignedUrlPut(`${Constants.ENTITY}/${PK}_${PK}.${body.fileExtension}`);
            }

            await Utils.updateProjectBudget(Constants.ENTITY, body);

            // Se retorna el id insertado
            return { PK, url };
        } catch (error) {
            this.createLog("error", "Service error", error);
            throw this.createResponse("INTERNAL_ERROR", null, error);
        }
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
        item.group = itemCoding.group;
        item.code = itemCoding.code;
        item.name = itemCoding.name;
        item.unity = itemCoding.unityName;
        item.value = itemCoding.unitValue;
        return { Put: { TableName: this.table, Item: this.createItemObject(PK, item) } };
    }

    /**
     * Function to format the data to save in DDB.
     * @param {object} payload - Data of the user.
     * @return {object} Dynamo object with the data to save.
     */
     createItemObject(PK, item) {
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
            group: item.group,
            code: item.code,
            name: item.name,
            unity: item.unity,
            value: item.value,
            quantity: item.quantity,
            creatorName: this.tokenData.name,
            creationUser: this.tokenData["cognito:username"],
            creationDate: item.creationDate,
        };
    }

    /**
     * Function to format the data to save in DDB.
     * @param {object} payload - Data of the user.
     * @return {object} Dynamo object with the data to save.
     */
     createRequisitionObject(payload, PK) {
        return {
            PK: PK,
            SK: PK,
            entity: Constants.ENTITY,
            relation1: payload.relation1,
            relation2: payload.relation2,
            relation3: payload.relation3,
            relation4: payload.relation4,
            project: payload.project,
            projectName: payload.projectName,
            frame: payload.frame,
            frameName: payload.frameName,
            requireDate: payload.requireDate,
            motive: payload.motive,
            observations: payload.observations,
            fileExtension: payload.fileExtension,
            status: Constants.STATUS.PENDING_APPROVAL,
            creatorName: this.tokenData.name,
            creationUser: this.tokenData["cognito:username"],
            creationDate: payload.creationDate,
        };
    }
}

module.exports = Service;
